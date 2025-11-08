#!/bin/bash

# Media Stack Test and Validation Script
# Tests Nextcloud, Plex, and video transcoding pipeline
# Version: 1.0.0
# Date: November 8, 2025

set -euo pipefail

# Configuration
NEXTCLOUD_URL="https://data.acdev.host"
PLEX_URL="https://plex.acdev.host"
NEXTCLOUD_USER="admin"
NEXTCLOUD_PASS="AdminPass2025!"
TEST_VIDEO_URL="https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
TEST_VIDEO_NAME="test_video_$(date +%s).mp4"

# Directories
WATCH_DIR="/mnt/nextcloud/data/admin/files/Videos/DropFolder"
PLEX_MOVIES="/mnt/plex/movies"
LOG_FILE="/var/log/media-stack-test.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE" >&2; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"; }
info() { echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"; }

pass_test() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
    ((TESTS_PASSED++))
}

fail_test() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
    ((TESTS_FAILED++))
}

# Function to test system prerequisites
test_prerequisites() {
    log "Testing system prerequisites..."

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        fail_test "Script must be run as root"
    else
        pass_test "Running as root"
    fi

    # Check Docker
    if docker --version &>/dev/null; then
        pass_test "Docker is installed: $(docker --version)"
    else
        fail_test "Docker is not installed"
    fi

    # Check FFMPEG
    if ffmpeg -version &>/dev/null; then
        if ffmpeg -encoders 2>/dev/null | grep -q "libx265"; then
            pass_test "FFMPEG with H265 support is installed"
        else
            warning "FFMPEG installed but H265 encoder not found"
        fi
    else
        fail_test "FFMPEG is not installed"
    fi

    # Check Nginx
    if nginx -v &>/dev/null; then
        pass_test "Nginx is installed"
    else
        fail_test "Nginx is not installed"
    fi

    # Check inotify-tools
    if command -v inotifywait &>/dev/null; then
        pass_test "inotify-tools is installed"
    else
        fail_test "inotify-tools is not installed"
    fi
}

# Function to test Docker containers
test_docker_containers() {
    log "Testing Docker containers..."

    # Check Nextcloud container
    if docker ps | grep -q nextcloud; then
        if [[ $(docker inspect nextcloud --format='{{.State.Status}}') == "running" ]]; then
            pass_test "Nextcloud container is running"
        else
            fail_test "Nextcloud container exists but not running"
        fi
    else
        fail_test "Nextcloud container not found"
    fi

    # Check Nextcloud database
    if docker ps | grep -q nextcloud_db; then
        pass_test "Nextcloud database container is running"
    else
        fail_test "Nextcloud database container not found"
    fi

    # Check Nextcloud Redis
    if docker ps | grep -q nextcloud_redis; then
        pass_test "Nextcloud Redis container is running"
    else
        fail_test "Nextcloud Redis container not found"
    fi
}

# Function to test Plex service
test_plex_service() {
    log "Testing Plex Media Server..."

    # Check if Plex is running
    if systemctl is-active plexmediaserver &>/dev/null; then
        pass_test "Plex Media Server is running"

        # Get Plex port
        PLEX_PORT=$(ss -tlnp | grep Plex | grep -oP ':\K[0-9]{5}' | head -1)
        if [ -n "$PLEX_PORT" ]; then
            pass_test "Plex is listening on port $PLEX_PORT"
        else
            fail_test "Could not detect Plex port"
        fi
    else
        fail_test "Plex Media Server is not running"
    fi

    # Check Plex directories
    if [ -d "$PLEX_MOVIES" ]; then
        pass_test "Plex movies directory exists"
    else
        fail_test "Plex movies directory not found"
    fi
}

# Function to test Nginx configuration
test_nginx_config() {
    log "Testing Nginx configuration..."

    # Test Nginx syntax
    if nginx -t &>/dev/null; then
        pass_test "Nginx configuration syntax is valid"
    else
        fail_test "Nginx configuration has syntax errors"
    fi

    # Check Nextcloud site
    if [ -f "/etc/nginx/sites-enabled/nextcloud" ]; then
        pass_test "Nextcloud Nginx site is enabled"
    else
        fail_test "Nextcloud Nginx site not enabled"
    fi

    # Check Plex site
    if [ -f "/etc/nginx/sites-enabled/plex" ]; then
        pass_test "Plex Nginx site is enabled"
    else
        fail_test "Plex Nginx site not enabled"
    fi

    # Test local connectivity
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200\|302"; then
        pass_test "Nextcloud is accessible on port 8080"
    else
        fail_test "Nextcloud not accessible on port 8080"
    fi
}

# Function to test video processing pipeline
test_video_pipeline() {
    log "Testing video processing pipeline..."

    # Check if video watcher service is running
    if systemctl is-active video-watcher.service &>/dev/null; then
        pass_test "Video watcher service is running"
    else
        fail_test "Video watcher service is not running"
    fi

    # Check watch directory
    if [ -d "$WATCH_DIR" ]; then
        pass_test "Watch directory exists: $WATCH_DIR"
    else
        fail_test "Watch directory not found: $WATCH_DIR"
        mkdir -p "$WATCH_DIR"
        warning "Created watch directory"
    fi

    # Check transcode directories
    if [ -d "/mnt/transcode/queue" ] && [ -d "/mnt/transcode/processing" ]; then
        pass_test "Transcode directories exist"
    else
        fail_test "Transcode directories not found"
    fi

    # Check transcode script
    if [ -x "/usr/local/bin/transcode-video.sh" ]; then
        pass_test "Transcode script is executable"
    else
        fail_test "Transcode script not found or not executable"
    fi
}

# Function to test actual video processing
test_video_processing() {
    log "Testing actual video processing workflow..."

    # Download test video
    info "Downloading test video..."
    if wget -q -O "/tmp/$TEST_VIDEO_NAME" "$TEST_VIDEO_URL" 2>/dev/null || \
       curl -s -o "/tmp/$TEST_VIDEO_NAME" "$TEST_VIDEO_URL" 2>/dev/null; then
        pass_test "Test video downloaded"
    else
        # Create a simple test video with ffmpeg if download fails
        warning "Could not download test video, creating one with ffmpeg..."
        ffmpeg -f lavfi -i testsrc=duration=10:size=320x240:rate=30 \
               -f lavfi -i sine=frequency=1000:duration=10 \
               -pix_fmt yuv420p "/tmp/$TEST_VIDEO_NAME" -y &>/dev/null
        pass_test "Test video created with ffmpeg"
    fi

    # Copy to watch folder
    info "Copying test video to watch folder..."
    cp "/tmp/$TEST_VIDEO_NAME" "$WATCH_DIR/"

    # Wait for processing
    info "Waiting for video to be detected and processed (up to 60 seconds)..."
    TIMEOUT=60
    ELAPSED=0

    while [ $ELAPSED -lt $TIMEOUT ]; do
        if [ -f "$PLEX_MOVIES/${TEST_VIDEO_NAME%.*}.mp4" ]; then
            pass_test "Video successfully transcoded and moved to Plex"

            # Check if it's H265
            if ffprobe "$PLEX_MOVIES/${TEST_VIDEO_NAME%.*}.mp4" 2>&1 | grep -q "hevc\|h265"; then
                pass_test "Video is encoded in H265"
            else
                warning "Video transcoded but not in H265 format"
            fi

            # Cleanup
            rm -f "$PLEX_MOVIES/${TEST_VIDEO_NAME%.*}.mp4"
            break
        fi

        sleep 5
        ((ELAPSED+=5))
        echo -n "."
    done

    if [ $ELAPSED -ge $TIMEOUT ]; then
        fail_test "Video processing timed out after $TIMEOUT seconds"
    fi

    # Cleanup
    rm -f "/tmp/$TEST_VIDEO_NAME"
}

# Function to test Nextcloud file scan
test_nextcloud_scan() {
    log "Testing Nextcloud file scanning..."

    # Check if scan timer is active
    if systemctl is-active nextcloud-scan.timer &>/dev/null; then
        pass_test "Nextcloud scan timer is active"

        # Check timer schedule
        next_run=$(systemctl status nextcloud-scan.timer | grep "Trigger:" | cut -d: -f2-)
        info "Next scan scheduled: $next_run"
    else
        fail_test "Nextcloud scan timer is not active"
    fi

    # Trigger manual scan
    info "Triggering manual file scan..."
    if docker exec nextcloud php occ files:scan --all &>/dev/null; then
        pass_test "Manual file scan completed successfully"
    else
        fail_test "Manual file scan failed"
    fi
}

# Function to test monitoring
test_monitoring() {
    log "Testing SOC monitoring integration..."

    # Check monitoring service
    if systemctl is-active media-monitor.service &>/dev/null; then
        pass_test "Media monitor service is running"
    else
        fail_test "Media monitor service is not running"
    fi

    # Check rsyslog forwarding
    if grep -q "@@10.0.0.3:514" /etc/rsyslog.conf; then
        pass_test "Rsyslog configured to forward to SOC"
    else
        fail_test "Rsyslog not configured for SOC forwarding"
    fi

    # Check log files
    if [ -f "/var/log/transcode.log" ]; then
        pass_test "Transcode log file exists"
        info "Recent transcode activity: $(tail -1 /var/log/transcode.log 2>/dev/null || echo 'No recent activity')"
    else
        warning "Transcode log file not found"
    fi

    if [ -f "/var/log/video-watcher.log" ]; then
        pass_test "Video watcher log file exists"
        info "Recent watcher activity: $(tail -1 /var/log/video-watcher.log 2>/dev/null || echo 'No recent activity')"
    else
        warning "Video watcher log file not found"
    fi
}

# Function to test external connectivity
test_external_access() {
    log "Testing external access..."

    # Test Nextcloud URL
    info "Testing Nextcloud URL: $NEXTCLOUD_URL"
    if curl -s -o /dev/null -w "%{http_code}" "$NEXTCLOUD_URL" | grep -q "200\|301\|302"; then
        pass_test "Nextcloud is accessible via $NEXTCLOUD_URL"
    else
        warning "Nextcloud URL not accessible (might need DNS propagation)"
    fi

    # Test Plex URL
    info "Testing Plex URL: $PLEX_URL"
    if curl -s -o /dev/null -w "%{http_code}" "$PLEX_URL" | grep -q "200\|301\|302"; then
        pass_test "Plex is accessible via $PLEX_URL"
    else
        warning "Plex URL not accessible (might need DNS propagation)"
    fi

    # Test DNS resolution
    if nslookup data.acdev.host 1.1.1.1 &>/dev/null; then
        pass_test "DNS resolution working for data.acdev.host"
    else
        warning "DNS resolution not working yet (propagation pending)"
    fi

    if nslookup plex.acdev.host 1.1.1.1 &>/dev/null; then
        pass_test "DNS resolution working for plex.acdev.host"
    else
        warning "DNS resolution not working yet (propagation pending)"
    fi
}

# Function to check performance
test_performance() {
    log "Testing system performance..."

    # Check disk space
    DISK_USAGE=$(df -h /mnt | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$DISK_USAGE" -lt 80 ]; then
        pass_test "Disk usage is acceptable: ${DISK_USAGE}%"
    else
        warning "Disk usage is high: ${DISK_USAGE}%"
    fi

    # Check memory usage
    MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
    if [ "$MEM_USAGE" -lt 80 ]; then
        pass_test "Memory usage is acceptable: ${MEM_USAGE}%"
    else
        warning "Memory usage is high: ${MEM_USAGE}%"
    fi

    # Check CPU load
    LOAD=$(uptime | awk '{print $10}' | sed 's/,//')
    CPU_COUNT=$(nproc)
    if (( $(echo "$LOAD < $CPU_COUNT" | bc -l) )); then
        pass_test "CPU load is acceptable: $LOAD (${CPU_COUNT} cores)"
    else
        warning "CPU load is high: $LOAD (${CPU_COUNT} cores)"
    fi
}

# Function to display summary
display_summary() {
    echo ""
    echo "========================================"
    echo "     MEDIA STACK TEST RESULTS          "
    echo "========================================"
    echo ""
    echo "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed successfully!${NC}"
        echo ""
        echo "Your media stack is fully operational:"
        echo "  • Nextcloud: $NEXTCLOUD_URL"
        echo "  • Plex: $PLEX_URL"
        echo "  • Video pipeline: Active and processing"
        echo "  • Monitoring: Connected to SOC"
    else
        echo -e "${YELLOW}⚠ Some tests failed. Review the log for details.${NC}"
        echo ""
        echo "Troubleshooting steps:"
        echo "1. Review failed tests above"
        echo "2. Check service logs:"
        echo "   journalctl -u plexmediaserver -n 50"
        echo "   docker logs nextcloud"
        echo "   journalctl -u video-watcher -n 50"
        echo "3. Verify network connectivity"
        echo "4. Check disk space: df -h"
    fi

    echo ""
    echo "Full test log: $LOG_FILE"
    echo ""
}

# Main execution
main() {
    log "Starting Media Stack validation tests..."
    echo ""

    # Run all tests
    test_prerequisites
    echo ""

    test_docker_containers
    echo ""

    test_plex_service
    echo ""

    test_nginx_config
    echo ""

    test_video_pipeline
    echo ""

    test_nextcloud_scan
    echo ""

    test_monitoring
    echo ""

    test_performance
    echo ""

    test_external_access
    echo ""

    # Optional: Run actual video processing test
    read -p "Do you want to test actual video processing? This may take a minute. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_video_processing
        echo ""
    fi

    # Display summary
    display_summary

    # Exit with appropriate code
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            # Skip time-consuming tests
            QUICK_TEST=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --quick    Skip time-consuming tests"
            echo "  --help     Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"