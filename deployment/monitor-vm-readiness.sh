#!/bin/bash
################################################################################
# VM Readiness Monitor
# Continuously checks VM accessibility and alerts when SSH is ready
################################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# VMs to monitor
declare -A VMS=(
    ["VMI01"]="46.250.243.123"
    ["VMI02D"]="46.250.241.70"
    ["VMI03"]="154.26.158.31"
)

ROOT_PASS="caxr84di@f1GLlCv"
CHECK_INTERVAL=30  # seconds

# Track ready status
declare -A READY_STATUS

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $1"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }

check_vm() {
    local name=$1
    local ip=$2

    # Check ping
    if ! ping -c 1 -W 3 "$ip" > /dev/null 2>&1; then
        echo "⏳ Waiting"
        return 1
    fi

    # Check SSH port
    if ! timeout 3 bash -c "echo > /dev/tcp/$ip/22" 2>/dev/null; then
        echo "🔄 Booting"
        return 1
    fi

    # Check SSH login
    if sshpass -p "$ROOT_PASS" ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
       -o UserKnownHostsFile=/dev/null "root@$ip" 'echo "OK"' > /dev/null 2>&1; then
        echo "✅ READY"
        return 0
    else
        echo "🔐 SSH Starting"
        return 1
    fi
}

monitor_loop() {
    clear
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  MCP Ecosystem - VM Readiness Monitor                     ║"
    log "╚════════════════════════════════════════════════════════════╝"
    echo ""
    info "Monitoring VMs... (checking every ${CHECK_INTERVAL}s)"
    echo ""

    local all_ready=false

    while [ "$all_ready" = false ]; do
        all_ready=true

        echo -e "${BLUE}Status at $(date +'%H:%M:%S'):${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        for vm_name in "${!VMS[@]}"; do
            vm_ip="${VMS[$vm_name]}"
            status=$(check_vm "$vm_name" "$vm_ip")

            printf "  %-10s %-17s %s\n" "$vm_name" "($vm_ip)" "$status"

            if [[ ! "$status" =~ "READY" ]]; then
                all_ready=false
            else
                READY_STATUS[$vm_name]=1
            fi
        done

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        if [ "$all_ready" = true ]; then
            echo ""
            log "🎉 ALL VMS ARE READY! 🎉"
            echo ""
            info "You can now proceed with deployment:"
            info "  ./deployment/deploy-production.sh"
            echo ""

            # Make a sound notification (if terminal supports it)
            echo -e "\a"

            break
        else
            echo ""
            info "Waiting for all VMs to become ready..."
            info "Next check in ${CHECK_INTERVAL} seconds... (Ctrl+C to stop)"
            sleep "$CHECK_INTERVAL"

            # Clear for next iteration
            clear
        fi
    done
}

# Show initial status
echo ""
info "Checking initial VM status..."
echo ""

for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    printf "  %-10s %-17s " "$vm_name" "($vm_ip)"
    check_vm "$vm_name" "$vm_ip"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ask if user wants to monitor
read -p "Start continuous monitoring? (yes/no): " -r
if [[ $REPLY =~ ^[Yy]es$ ]]; then
    monitor_loop
else
    info "Monitoring cancelled. Run this script again to check readiness."
fi
