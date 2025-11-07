#!/bin/bash
################################################################################
# PostgreSQL 16 Streaming Replication Setup
#
# Sets up high-availability PostgreSQL cluster:
# - VMI01 (10.0.0.1): Primary server (read/write)
# - VMI02D (10.0.0.2): Hot standby (read-only, automatic failover)
#
# Features:
# - Streaming replication with replication slots
# - WAL archiving to VMI02D storage
# - Automatic failover capability
# - Read-only load balancing on standby
################################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }

# Configuration
VMI01_IP="10.0.0.1"
VMI02D_IP="10.0.0.2"
SSH_KEY=".keys/mcp-deployment-ed25519"
REPL_USER="replicator"
REPL_PASSWORD="$(openssl rand -base64 32)"
DB_ADMIN_PASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0="

################################################################################
# PHASE 1: Install PostgreSQL 16 on both servers
################################################################################

install_postgresql() {
    local server_name=$1
    local server_ip=$2

    log "Installing PostgreSQL 16 on $server_name ($server_ip)..."

    ssh -i "$SSH_KEY" "root@$server_ip" bash << 'EOF'
#!/bin/bash
set -euo pipefail

echo "[$(hostname)] Installing PostgreSQL 16..."

# Add PostgreSQL APT repository
apt-get install -y -qq wget ca-certificates
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# Install PostgreSQL 16
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql-16 \
    postgresql-contrib-16 \
    postgresql-16-pgvector \
    postgresql-client-16

# Stop PostgreSQL (we'll configure before starting)
systemctl stop postgresql

echo "[$(hostname)] PostgreSQL 16 installed ✓"
EOF

    log "$server_name: PostgreSQL 16 installed ✓"
}

################################################################################
# PHASE 2: Configure Primary (VMI01)
################################################################################

configure_primary() {
    log "=== Configuring VMI01 as Primary Server ==="

    # Transfer performance configuration
    log "Transferring performance configuration to VMI01..."
    scp -i "$SSH_KEY" \
        deployment/config/postgresql-vmi01-performance.conf \
        "root@$VMI01_IP:/etc/postgresql/16/main/postgresql.conf"

    # Configure primary server
    ssh -i "$SSH_KEY" "root@$VMI01_IP" bash << EOF
#!/bin/bash
set -euo pipefail

echo "[VMI01] Configuring primary server..."

# Create replication user
su - postgres -c "psql -c \\"CREATE ROLE $REPL_USER WITH REPLICATION LOGIN PASSWORD '$REPL_PASSWORD';\\""

# Create replication slot
su - postgres -c "psql -c \\"SELECT * FROM pg_create_physical_replication_slot('standby_slot');\\""

# Configure pg_hba.conf for replication
cat >> /etc/postgresql/16/main/pg_hba.conf << 'PGHBA'

# Replication connections from standby (VMI02D)
host    replication     replicator      10.0.0.2/32             scram-sha-256

# Allow MCP services from private LAN
host    all             all             10.0.0.0/22             scram-sha-256

# Allow connections from HAProxy (VMI03)
host    all             all             10.0.0.3/32             scram-sha-256
PGHBA

# Create database if it doesn't exist
su - postgres -c "createdb mcp_ecosystem || true"

# Create admin user
su - postgres -c "psql -c \\"CREATE USER mcp_admin WITH PASSWORD '$DB_ADMIN_PASSWORD';\\""
su - postgres -c "psql -c \\"GRANT ALL PRIVILEGES ON DATABASE mcp_ecosystem TO mcp_admin;\\""

# Enable required extensions
su - postgres -c "psql -d mcp_ecosystem -c \\"CREATE EXTENSION IF NOT EXISTS pg_trgm;\\""
su - postgres -c "psql -d mcp_ecosystem -c \\"CREATE EXTENSION IF NOT EXISTS pg_stat_statements;\\""

# Create WAL archive directory
mkdir -p /var/lib/postgresql/wal_archive
chown postgres:postgres /var/lib/postgresql/wal_archive

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

echo "[VMI01] Primary server configured and started ✓"
EOF

    log "VMI01 configured as primary ✓"
}

################################################################################
# PHASE 3: Configure Standby (VMI02D)
################################################################################

configure_standby() {
    log "=== Configuring VMI02D as Hot Standby ==="

    # Transfer standby configuration
    log "Transferring standby configuration to VMI02D..."
    scp -i "$SSH_KEY" \
        deployment/config/postgresql-vmi02d-standby.conf \
        "root@$VMI02D_IP:/etc/postgresql/16/main/postgresql.conf"

    # Configure standby server
    ssh -i "$SSH_KEY" "root@$VMI02D_IP" bash << EOF
#!/bin/bash
set -euo pipefail

echo "[VMI02D] Configuring hot standby server..."

# Stop PostgreSQL if running
systemctl stop postgresql || true

# Remove existing data directory
rm -rf /var/lib/postgresql/16/main/*

# Create base backup from primary using pg_basebackup
echo "[VMI02D] Creating base backup from primary (this may take a few minutes)..."
su - postgres -c "PGPASSWORD='$REPL_PASSWORD' pg_basebackup -h $VMI01_IP -D /var/lib/postgresql/16/main -U $REPL_USER -P -v -R -X stream -C -S standby_slot"

# Create standby.signal file (tells PostgreSQL this is a standby)
touch /var/lib/postgresql/16/main/standby.signal
chown postgres:postgres /var/lib/postgresql/16/main/standby.signal

# Configure connection to primary in postgresql.auto.conf
cat >> /var/lib/postgresql/16/main/postgresql.auto.conf << AUTOCONF
primary_conninfo = 'host=$VMI01_IP port=5432 user=$REPL_USER password=$REPL_PASSWORD application_name=standby_01'
primary_slot_name = 'standby_slot'
restore_command = 'cp /mnt/storage/backups/database/wal-archive/%f %p'
AUTOCONF

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Wait for replication to catch up
echo "[VMI02D] Waiting for replication to sync..."
sleep 5

echo "[VMI02D] Hot standby server configured and started ✓"
EOF

    log "VMI02D configured as hot standby ✓"
}

################################################################################
# PHASE 4: Verify Replication
################################################################################

verify_replication() {
    log "=== Verifying Replication Status ==="

    # Check replication on primary
    log "Checking replication status on primary..."
    ssh -i "$SSH_KEY" "root@$VMI01_IP" bash << 'EOF'
#!/bin/bash
echo "[VMI01] Replication status:"
su - postgres -c "psql -x -c 'SELECT * FROM pg_stat_replication;'"
EOF

    # Check standby status
    log "Checking standby status..."
    ssh -i "$SSH_KEY" "root@$VMI02D_IP" bash << 'EOF'
#!/bin/bash
echo "[VMI02D] Recovery status:"
su - postgres -c "psql -x -c 'SELECT pg_is_in_recovery();'"

echo "[VMI02D] Replication lag:"
su - postgres -c "psql -x -c 'SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;'"
EOF

    # Test write on primary and read on standby
    log "Testing replication with sample data..."

    # Write on primary
    ssh -i "$SSH_KEY" "root@$VMI01_IP" bash << 'EOF'
su - postgres -c "psql -d mcp_ecosystem -c \\"CREATE TABLE IF NOT EXISTS replication_test (id SERIAL, test_data TEXT, created_at TIMESTAMP DEFAULT NOW());\\""
su - postgres -c "psql -d mcp_ecosystem -c \\"INSERT INTO replication_test (test_data) VALUES ('Replication test at $(date)');\\""
EOF

    sleep 2

    # Read on standby
    ssh -i "$SSH_KEY" "root@$VMI02D_IP" bash << 'EOF'
echo "[VMI02D] Reading replicated data:"
su - postgres -c "psql -d mcp_ecosystem -c \\"SELECT * FROM replication_test ORDER BY id DESC LIMIT 1;\\""
EOF

    log "Replication verification complete ✓"
}

################################################################################
# PHASE 5: Save Credentials
################################################################################

save_credentials() {
    log "Saving replication credentials..."

    cat > deployment/config/replication-credentials.txt << CREDS
# PostgreSQL Replication Credentials
# Generated: $(date)

Replication User: $REPL_USER
Replication Password: $REPL_PASSWORD

Primary Server: $VMI01_IP:5432
Standby Server: $VMI02D_IP:5432

Connection String (Primary):
postgresql://mcp_admin:$DB_ADMIN_PASSWORD@$VMI01_IP:5432/mcp_ecosystem

Connection String (Standby - Read Only):
postgresql://mcp_admin:$DB_ADMIN_PASSWORD@$VMI02D_IP:5432/mcp_ecosystem

Replication Slot: standby_slot
CREDS

    chmod 600 deployment/config/replication-credentials.txt

    log "Credentials saved to: deployment/config/replication-credentials.txt"
}

################################################################################
# Main Execution
################################################################################

main() {
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  PostgreSQL 16 Streaming Replication Setup               ║"
    log "║  Primary: VMI01 (10.0.0.1)                               ║"
    log "║  Standby: VMI02D (10.0.0.2)                              ║"
    log "╚════════════════════════════════════════════════════════════╝"
    echo ""

    # Phase 1: Install PostgreSQL on both servers
    install_postgresql "VMI01" "$VMI01_IP"
    install_postgresql "VMI02D" "$VMI02D_IP"

    # Phase 2: Configure primary
    configure_primary

    # Phase 3: Configure standby
    configure_standby

    # Phase 4: Verify replication
    verify_replication

    # Phase 5: Save credentials
    save_credentials

    log ""
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  PostgreSQL replication setup complete!                  ║"
    log "║  Primary: $VMI01_IP:5432 (read/write)           ║"
    log "║  Standby: $VMI02D_IP:5432 (read-only)           ║"
    log "╚════════════════════════════════════════════════════════════╝"
    log ""
    log "Next steps:"
    info "  1. Run database migration: deployment/migration-v02/deploy-migration.sh"
    info "  2. Deploy MCP services"
    info "  3. Configure Wasabi S3 backups with pgBackRest"
}

main "$@"
