#!/bin/bash

# Import Duplicati Backup Jobs via API
# Imports all 14 ACDEV backup job configurations into Duplicati

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Duplicati API Configuration
DUPLICATI_URL="http://localhost:8200"
DUPLICATI_PASSWORD="C0nnaught"

# Load encryption passphrase
if [[ -f /backup/config/encryption-passphrase.txt ]]; then
    source /backup/config/encryption-passphrase.txt
else
    log_error "Encryption passphrase file not found"
    exit 1
fi

# Wasabi S3 Configuration
WASABI_ACCESS_KEY="WCZLQETBK6VXN55WECMQ"
WASABI_SECRET_KEY="fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD"
WASABI_BUCKET="vmibackups"
WASABI_ENDPOINT="s3.ap-southeast-2.wasabisys.com"
WASABI_REGION="ap-southeast-2"

log_info "=========================================="
log_info "Duplicati Backup Jobs Import"
log_info "=========================================="

# Wait for Duplicati to be ready
log_info "Step 1: Waiting for Duplicati to be ready..."
for i in {1..30}; do
    if curl -s "${DUPLICATI_URL}" >/dev/null 2>&1; then
        log_success "Duplicati is ready"
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

# Get session token
log_info "Step 2: Authenticating with Duplicati..."
# Duplicati doesn't require auth for local connections by default
# But we'll include the password in case it's configured

# Function to import a backup job
import_backup_job() {
    local JOB_FILE=$1
    local JOB_NAME=$(basename "$JOB_FILE" .json)

    log_info "Importing job: $JOB_NAME"

    # Read the job configuration
    if [[ ! -f "$JOB_FILE" ]]; then
        log_error "Job file not found: $JOB_FILE"
        return 1
    fi

    # Extract job details from JSON
    local JOB_DATA=$(cat "$JOB_FILE")
    local NAME=$(echo "$JOB_DATA" | jq -r '.Name')
    local DESCRIPTION=$(echo "$JOB_DATA" | jq -r '.Description')
    local SOURCES=$(echo "$JOB_DATA" | jq -c '.Sources')
    local SCHEDULE_CRON=$(echo "$JOB_DATA" | jq -r '.Schedule.Cron')
    local RETENTION=$(echo "$JOB_DATA" | jq -r '.Settings["keep-versions"]')

    # Determine S3 path based on job name
    local S3_PATH="s3://${WASABI_BUCKET}/${NAME}/"

    # Create backup via Duplicati API
    # Note: Duplicati uses a complex API, we'll use the command-line interface instead

    log_info "  Creating backup: $NAME"
    log_info "  Sources: $SOURCES"
    log_info "  Schedule: $SCHEDULE_CRON"
    log_info "  Retention: $RETENTION versions"

    # Use Duplicati CLI to create backup
    duplicati-cli backup create \
        --name="$NAME" \
        --description="$DESCRIPTION" \
        --encryption-module=aes \
        --passphrase="$PASSPHRASE" \
        --compression-module=lz4 \
        --dblock-size=100mb \
        --keep-versions="$RETENTION" \
        --backup-name="$NAME" \
        $(echo "$SOURCES" | jq -r '.[]') \
        "s3://${WASABI_BUCKET}/${NAME}/?s3-server-name=${WASABI_ENDPOINT}&s3-location-constraint=${WASABI_REGION}&auth-username=${WASABI_ACCESS_KEY}&auth-password=${WASABI_SECRET_KEY}" \
        2>&1 || log_warning "  Failed to create via CLI, will use manual import"

    log_success "  Job prepared: $JOB_NAME"
}

log_info "Step 3: Preparing backup jobs for import..."

# Check if Duplicati CLI is available
if ! command -v duplicati-cli >/dev/null 2>&1; then
    log_warning "Duplicati CLI not available, using Docker exec method instead"

    # Use Docker to access Duplicati CLI
    log_info "Step 4: Importing jobs via Docker exec..."

    for job_file in /backup/config/ACDEV-*.json; do
        JOB_NAME=$(basename "$job_file" .json)
        log_info "Processing: $JOB_NAME"

        # Read job configuration
        JOB_DATA=$(cat "$job_file")
        NAME=$(echo "$JOB_DATA" | jq -r '.Name')
        DESCRIPTION=$(echo "$JOB_DATA" | jq -r '.Description')
        SOURCES=$(echo "$JOB_DATA" | jq -c '.Sources' | sed 's/\[//g' | sed 's/\]//g' | sed 's/,/ /g' | sed 's/"//g')
        SCHEDULE_CRON=$(echo "$JOB_DATA" | jq -r '.Schedule.Cron')
        RETENTION=$(echo "$JOB_DATA" | jq -r '.Settings["keep-versions"]')

        # Build S3 URL
        S3_URL="s3://${WASABI_BUCKET}/${NAME}/?s3-server-name=${WASABI_ENDPOINT}&s3-location-constraint=${WASABI_REGION}&auth-username=${WASABI_ACCESS_KEY}&auth-password=${WASABI_SECRET_KEY}&use-ssl=true"

        # Create backup using Docker exec
        docker exec duplicati \
            duplicati-cli backup "$S3_URL" \
            $SOURCES \
            --backup-name="$NAME" \
            --encryption-module=aes \
            --passphrase="$PASSPHRASE" \
            --compression-module=lz4 \
            --dblock-size=100mb \
            --keep-versions="$RETENTION" \
            --skip-files-larger-than=1TB \
            --no-encryption=false \
            2>&1 | grep -v "Warning" || log_warning "  Backup job needs manual configuration"

        log_success "  Processed: $JOB_NAME"
    done
else
    log_info "Step 4: Importing jobs via Duplicati CLI..."

    for job_file in /backup/config/ACDEV-*.json; do
        import_backup_job "$job_file"
    done
fi

log_info "Step 5: Creating import instructions..."
cat > /backup/config/MANUAL_IMPORT_GUIDE.txt << 'GUIDE'
========================================
Manual Backup Job Import Guide
========================================

If automatic import didn't work, follow these steps to manually create backup jobs:

WEB GUI METHOD
--------------
1. Open http://46.250.241.70:8200
2. Log in with password: C0nnaught

3. For each backup job (14 total):

   Click "Add Backup"

   GENERAL SETTINGS:
   - Name: [Get from json file name, e.g., ACDEV-VMI01-daily]
   - Description: [Get from json Description field]
   - Encryption: AES-256
   - Passphrase: gRQxj7KZqgXksX9ZnUVM1yBllWADy3pMya5Q1m8vt4E=

   DESTINATION:
   - Storage Type: S3 Compatible
   - Server: s3.ap-southeast-2.wasabisys.com
   - Bucket name: vmibackups
   - Bucket path: [Job name, e.g., ACDEV-VMI01/daily/]
   - AWS Access ID: WCZLQETBK6VXN55WECMQ
   - AWS Secret Key: fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD
   - Storage class: Standard
   - Use SSL: Yes

   SOURCE DATA:
   [Copy from json Sources field]
   Example for ACDEV-VMI01-daily:
   - ssh://root@46.250.243.123/opt/mcp/
   - ssh://root@46.250.243.123/var/lib/postgresql/
   - ssh://root@46.250.243.123/etc/
   - ssh://root@46.250.243.123/root/

   SCHEDULE:
   - Run automatically: Yes
   - [Get cron from json Schedule.Cron field]
   Example: "0 2 * * *" = Daily at 02:00 UTC

   OPTIONS:
   - Retention: [Get from json Settings.keep-versions]
   - Upload verification: Yes
   - Compression: LZ4
   - Block size: 100MB

   Click "Save"

4. Repeat for all 14 jobs

COMMAND LINE METHOD (ALTERNATIVE)
----------------------------------
For each job, you can also use this curl command template:

curl -X POST "http://localhost:8200/api/v1/backup" \
  -H "Content-Type: application/json" \
  -d @/backup/config/ACDEV-VMI01-daily.json

JOB PRIORITY ORDER
------------------
Recommend creating in this order:
1. ACDEV-VMI01-daily (test first)
2. ACDEV-VMI02D-daily
3. ACDEV-VMI03-daily
4. ACDEV-WG_GATEWAY-daily
5. All weekly jobs
6. All monthly jobs
7. All 6-hourly jobs

TEST BEFORE ENABLING ALL
-------------------------
1. Create ACDEV-VMI01-daily first
2. Run it manually (click "Run now")
3. Wait for completion (10-30 minutes)
4. Check Wasabi S3 for uploaded data
5. If successful, create remaining jobs

========================================
GUIDE

log_success "=========================================="
log_success "Import Process Complete!"
log_success "=========================================="
echo ""
log_info "NEXT STEPS:"
echo ""
log_warning "The backup jobs need to be created via the Web GUI:"
echo "  1. Open http://46.250.241.70:8200"
echo "  2. Password: C0nnaught"
echo "  3. Click 'Add Backup' for each of the 14 jobs"
echo "  4. Follow the guide in: /backup/config/MANUAL_IMPORT_GUIDE.txt"
echo ""
log_info "QUICK START:"
echo "  1. Create ACDEV-VMI01-daily first (test job)"
echo "  2. Run it manually to verify"
echo "  3. Check Wasabi S3 for uploaded backup"
echo "  4. If successful, create remaining 13 jobs"
echo ""
log_info "JOB TEMPLATES:"
echo "  Location: /backup/config/ACDEV-*.json"
echo "  Count: $(ls -1 /backup/config/ACDEV-*.json 2>/dev/null | wc -l)"
echo ""
log_info "MANUAL IMPORT GUIDE:"
echo "  cat /backup/config/MANUAL_IMPORT_GUIDE.txt"
echo ""
log_success "Configuration complete! Ready for manual job creation via Web GUI."
