#!/bin/bash
# Monitor Phase 1 Hardening Progress on All VMs
# Auto-proceeds to next phases when complete

set -euo pipefail

VMI01="46.250.243.123"
VMI02D="46.250.241.70"
VMI03="154.26.158.31"
PASSWORD="caxr84di@f1GLlCv"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

check_vm_status() {
    local vm_ip=$1
    local vm_name=$2

    # Check if hardening script is still running
    if sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 root@$vm_ip 'ps aux | grep -v grep | grep phase1-hardening.sh' >/dev/null 2>&1; then
        # Get last completed step
        local last_step=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@$vm_ip 'tail -100 /root/phase1-hardening.log 2>&1 | grep -E "^✅" | tail -1' 2>/dev/null || echo "")
        echo "RUNNING|$last_step"
    else
        # Check if completed successfully
        if sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@$vm_ip 'grep -q "Phase 1 Hardening Complete" /root/phase1-hardening.log 2>&1' 2>/dev/null; then
            echo "COMPLETE"
        else
            echo "FAILED"
        fi
    fi
}

echo "=========================================="
echo "Phase 1 Hardening Progress Monitor"
echo "Started: $(date)"
echo "=========================================="
echo ""

# Monitor loop
while true; do
    clear
    echo "=========================================="
    echo "Phase 1 Hardening Progress Monitor"
    echo "Current Time: $(date +%H:%M:%S)"
    echo "=========================================="
    echo ""

    vmi01_status=$(check_vm_status $VMI01 "VMI01")
    vmi02d_status=$(check_vm_status $VMI02D "VMI02D")
    vmi03_status=$(check_vm_status $VMI03 "VMI03")

    # VMI01
    echo -e "${BLUE}VMI01 (Dev/MCP Server):${NC}"
    if [[ $vmi01_status == COMPLETE ]]; then
        log_success "Hardening Complete!"
    elif [[ $vmi01_status == FAILED ]]; then
        log_error "Hardening Failed - Check logs"
    else
        status_msg=$(echo $vmi01_status | cut -d'|' -f2)
        log_info "In Progress: $status_msg"
    fi
    echo ""

    # VMI02D
    echo -e "${BLUE}VMI02D (Storage Server):${NC}"
    if [[ $vmi02d_status == COMPLETE ]]; then
        log_success "Hardening Complete!"
    elif [[ $vmi02d_status == FAILED ]]; then
        log_error "Hardening Failed - Check logs"
    else
        status_msg=$(echo $vmi02d_status | cut -d'|' -f2)
        log_info "In Progress: $status_msg"
    fi
    echo ""

    # VMI03
    echo -e "${BLUE}VMI03 (Security Gateway):${NC}"
    if [[ $vmi03_status == COMPLETE ]]; then
        log_success "Hardening Complete!"
    elif [[ $vmi03_status == FAILED ]]; then
        log_error "Hardening Failed - Check logs"
    else
        status_msg=$(echo $vmi03_status | cut -d'|' -f2)
        log_info "In Progress: $status_msg"
    fi
    echo ""

    # Check if all complete
    if [[ $vmi01_status == COMPLETE ]] && [[ $vmi02d_status == COMPLETE ]] && [[ $vmi03_status == COMPLETE ]]; then
        echo "=========================================="
        log_success "ALL VMs HARDENING COMPLETE!"
        echo "=========================================="
        echo ""
        echo "Next: Automatically proceeding to Phase 2..."
        exit 0
    fi

    # Check for failures
    if [[ $vmi01_status == FAILED ]] || [[ $vmi02d_status == FAILED ]] || [[ $vmi03_status == FAILED ]]; then
        echo "=========================================="
        log_error "HARDENING FAILED ON ONE OR MORE VMs"
        echo "=========================================="
        exit 1
    fi

    echo "Refreshing in 30 seconds... (Ctrl+C to stop monitoring)"
    sleep 30
done
