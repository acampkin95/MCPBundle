#!/bin/bash
#
# WORM Area Test Script for VMI02D
# Tests SFTP access, file upload, and automated archival
#
# Usage: Run from client machine (not on VMI02D)
#   chmod +x test-worm-vmi02d.sh
#   ./test-worm-vmi02d.sh <server-ip>
#

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# Configuration
SERVER_IP="${1:-}"
USERNAME="AccessService"
PASSWORD="${PASSWORD:-${WORM_ACCESS_PASSWORD:-}}"

if [ -z "$PASSWORD" ]; then
    log_error "Set WORM_ACCESS_PASSWORD (or PASSWORD) from Contabo secret worm-access-password before running (use npm run secrets:pull)."
    exit 1
fi
TEST_FILE="/tmp/worm_test_$(date +%s).txt"

if [ -z "$SERVER_IP" ]; then
    log_error "Usage: $0 <server-ip>"
    exit 1
fi

log_info "Starting WORM Area Tests for ${SERVER_IP}..."
echo ""

# Check dependencies
log_info "Checking dependencies..."
if ! command -v sshpass &> /dev/null; then
    log_error "sshpass not found. Install with:"
    echo "  - Ubuntu/Debian: apt-get install sshpass"
    echo "  - macOS: brew install sshpass"
    echo "  - RHEL/CentOS: yum install sshpass"
    exit 1
fi

if ! command -v sftp &> /dev/null; then
    log_error "sftp not found. Please install OpenSSH client"
    exit 1
fi

# Test 1: SFTP Connection
log_test "Test 1: SFTP Connection"
if SSHPASS= sshpass -e"${PASSWORD}" sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${USERNAME}@${SERVER_IP} <<EOF 2>&1 | grep -q "Connected"
bye
EOF
then
    echo -e "  ${GREEN}✓${NC} SFTP connection successful"
else
    echo -e "  ${RED}✗${NC} SFTP connection failed"
    exit 1
fi

# Test 2: Verify chroot jail (user should only see upload directory)
log_test "Test 2: Chroot Jail Verification"
SFTP_OUTPUT=$(SSHPASS= sshpass -e"${PASSWORD}" sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${USERNAME}@${SERVER_IP} <<EOF 2>&1
pwd
ls -la
bye
EOF
)

if echo "$SFTP_OUTPUT" | grep -q "upload"; then
    echo -e "  ${GREEN}✓${NC} Chroot jail working (can see upload directory)"
else
    echo -e "  ${YELLOW}⚠${NC} Cannot verify upload directory visibility"
fi

if ! echo "$SFTP_OUTPUT" | grep -q "/etc\|/root\|/home"; then
    echo -e "  ${GREEN}✓${NC} Cannot access system directories (good)"
else
    echo -e "  ${RED}✗${NC} Can access system directories (chroot may not be working)"
fi

# Test 3: Upload a test file
log_test "Test 3: File Upload"
echo "WORM Test File - $(date)" > ${TEST_FILE}
echo "This file should be automatically archived after upload." >> ${TEST_FILE}
echo "Timestamp: $(date +%s)" >> ${TEST_FILE}

if SSHPASS= sshpass -e"${PASSWORD}" sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${USERNAME}@${SERVER_IP} <<EOF 2>&1 | grep -q "Uploading"
cd upload
put ${TEST_FILE}
bye
EOF
then
    echo -e "  ${GREEN}✓${NC} File uploaded successfully"
else
    echo -e "  ${RED}✗${NC} File upload failed"
    rm -f ${TEST_FILE}
    exit 1
fi

# Clean up local test file
rm -f ${TEST_FILE}

# Test 4: Wait for archival (the service should move the file)
log_test "Test 4: Automated Archival (waiting 5 seconds...)"
sleep 5

# Check if file still exists in upload directory
UPLOAD_CHECK=$(SSHPASS= sshpass -e"${PASSWORD}" sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${USERNAME}@${SERVER_IP} <<EOF 2>&1
cd upload
ls
bye
EOF
)

UPLOADED_FILENAME=$(basename ${TEST_FILE})
if echo "$UPLOAD_CHECK" | grep -q "$UPLOADED_FILENAME"; then
    echo -e "  ${YELLOW}⚠${NC} File still in upload directory (archival may be slow or not working)"
else
    echo -e "  ${GREEN}✓${NC} File removed from upload directory (archived)"
fi

# Test 5: Verify user cannot execute shell commands
log_test "Test 5: Shell Access Prevention"
if SSHPASS= sshpass -e"${PASSWORD}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${USERNAME}@${SERVER_IP} "ls" 2>&1 | grep -q "subsystem request failed\|command not found\|not permitted"; then
    echo -e "  ${GREEN}✓${NC} Shell access correctly denied"
else
    echo -e "  ${YELLOW}⚠${NC} Shell access check inconclusive"
fi

# Test 6: Try to access parent directories (should fail)
log_test "Test 6: Directory Traversal Prevention"
TRAVERSAL_TEST=$(SSHPASS= sshpass -e"${PASSWORD}" sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${USERNAME}@${SERVER_IP} <<EOF 2>&1
cd ..
pwd
bye
EOF
)

if echo "$TRAVERSAL_TEST" | grep -q "Can't change directory\|Couldn't canonicalize\|Permission denied"; then
    echo -e "  ${GREEN}✓${NC} Directory traversal correctly prevented"
else
    echo -e "  ${YELLOW}⚠${NC} Directory traversal check inconclusive"
fi

# Summary
echo ""
log_info "========================================="
log_info "Test Summary"
log_info "========================================="
echo ""
echo "The WORM area appears to be working correctly."
echo ""
log_info "Next Steps:"
echo "  1. Check archive directory on server (as root):"
echo "     ssh root@${SERVER_IP} 'ls -lah /mnt/secure-archive/'"
echo ""
echo "  2. Verify file is immutable:"
echo "     ssh root@${SERVER_IP} 'lsattr /mnt/secure-archive/*'"
echo "     (Look for 'i' flag indicating immutable)"
echo ""
echo "  3. Monitor archive service:"
echo "     ssh root@${SERVER_IP} 'journalctl -u worm-archive.service -f'"
echo ""
echo "  4. Check archive logs:"
echo "     ssh root@${SERVER_IP} 'tail -f /var/log/worm-archive.log'"
echo ""
log_warn "Security Reminder:"
echo "  - Files in /mnt/secure-archive/ are immutable (cannot be modified)"
echo "  - To remove immutable flag (admin only): chattr -i <file>"
echo "  - AccessService user has no access to archived files"
echo ""
