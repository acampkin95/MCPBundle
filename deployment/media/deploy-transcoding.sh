#!/bin/bash
#==============================================================================
# Automated Video Transcoding Service for VMI02D
#==============================================================================
# Purpose: Monitor /nextcloud/plex-ingest, transcode videos, and update Plex
# Target: VMI02D (46.250.241.70)
# Database: VMI01 (46.250.243.123)
# Version: 1.0.0
# Date: 2025-11-08
#==============================================================================

set -euo pipefail

#==============================================================================
# COLORS AND FORMATTING
#==============================================================================
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color
readonly BOLD='\033[1m'

#==============================================================================
# CONFIGURATION
#==============================================================================
readonly SCRIPT_VERSION="1.0.0"
readonly WATCH_DIR="/nextcloud/plex-ingest"
readonly OUTPUT_DIR="/opt/plex/movies"
readonly TRANSCODE_WORK_DIR="/opt/plex/transcode/work"
readonly LOG_DIR="/var/log/transcoding"
readonly PID_FILE="/var/run/transcoding-daemon.pid"

# Transcoding Settings
readonly TARGET_CODEC="libx265"  # H.265/HEVC
readonly TARGET_RESOLUTION="1920x1080"  # 1080p
readonly TARGET_CRF="23"  # Constant Rate Factor (18-28, lower = better quality)
readonly TARGET_PRESET="medium"  # ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
readonly TARGET_AUDIO_CODEC="aac"
readonly TARGET_AUDIO_BITRATE="192k"

# Performance Settings
readonly MAX_PARALLEL_JOBS=2
readonly CPU_LIMIT_PERCENT=80
readonly MEMORY_LIMIT_GB=8
readonly NICE_LEVEL=10  # Lower priority

# Monitoring Settings
readonly SCAN_INTERVAL=30  # seconds
readonly DB_HOST="46.250.243.123"
readonly DB_PORT="5432"
readonly DB_NAME="mcp_ecosystem"
readonly DB_USER="mcp_admin"
readonly DB_PASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0="

# Redis Settings
readonly REDIS_HOST="localhost"
readonly REDIS_PORT="6379"

# Plex Settings
readonly PLEX_URL="http://localhost:32400"
readonly PLEX_TOKEN=""  # Will be auto-detected or set manually

# Supported video formats
readonly SUPPORTED_FORMATS=("mp4" "avi" "mkv" "mov" "wmv" "flv" "webm" "m4v" "mpg" "mpeg")

#==============================================================================
# LOGGING FUNCTIONS
#==============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_section() {
    echo -e "\n${CYAN}${BOLD}==>${NC} ${BOLD}$*${NC}\n"
}

#==============================================================================
# ERROR HANDLING
#==============================================================================
error_exit() {
    log_error "$1"
    exit 1
}

cleanup_on_error() {
    log_warning "Cleaning up after error..."
}

trap cleanup_on_error ERR

#==============================================================================
# VALIDATION FUNCTIONS
#==============================================================================
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

check_os() {
    if [[ ! -f /etc/os-release ]]; then
        error_exit "Cannot detect OS version"
    fi

    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        log_warning "This script is designed for Ubuntu. Detected: $ID $VERSION_ID"
    fi
}

check_dependencies() {
    log_info "Checking dependencies..."

    local missing_deps=()

    # Check for required commands
    for cmd in ffmpeg ffprobe psql redis-cli python3 pip3 curl jq; do
        if ! command -v "$cmd" &>/dev/null; then
            missing_deps+=("$cmd")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_warning "Missing dependencies: ${missing_deps[*]}"
        return 1
    fi

    log_success "All dependencies present"
    return 0
}

check_directories() {
    log_info "Checking required directories..."

    if [[ ! -d "$WATCH_DIR" ]]; then
        error_exit "Watch directory not found: $WATCH_DIR"
    fi

    if [[ ! -d "$OUTPUT_DIR" ]]; then
        error_exit "Output directory not found: $OUTPUT_DIR"
    fi

    log_success "Required directories exist"
}

#==============================================================================
# INSTALLATION FUNCTIONS
#==============================================================================
install_ffmpeg() {
    log_section "Installing FFmpeg with H.265 support..."

    # Update package lists
    apt-get update

    # Install FFmpeg and related tools
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        ffmpeg \
        libx265-dev \
        libx264-dev \
        libvpx-dev \
        libmp3lame-dev \
        libopus-dev \
        libfdk-aac-dev \
        mediainfo \
        mkvtoolnix

    # Verify FFmpeg installation
    if ffmpeg -version | grep -q "ffmpeg version"; then
        log_success "FFmpeg installed successfully"
        ffmpeg -version | head -n 1
    else
        error_exit "FFmpeg installation failed"
    fi

    # Verify H.265 encoder support
    if ffmpeg -encoders 2>/dev/null | grep -q "libx265"; then
        log_success "H.265 (HEVC) encoder available"
    else
        log_warning "H.265 encoder may not be available"
    fi
}

install_python_dependencies() {
    log_section "Installing Python dependencies..."

    # Install required Python packages
    pip3 install --upgrade \
        watchdog \
        psycopg2-binary \
        redis \
        requests

    log_success "Python dependencies installed"
}

create_directories() {
    log_section "Creating directory structure..."

    mkdir -p "$TRANSCODE_WORK_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$WATCH_DIR"
    mkdir -p "$OUTPUT_DIR"

    # Set permissions
    chown -R plex:plex "$TRANSCODE_WORK_DIR"
    chown -R plex:plex "$OUTPUT_DIR"
    chmod 755 "$LOG_DIR"

    log_success "Directories created"
}

create_transcoding_daemon() {
    log_section "Creating transcoding daemon..."

    cat > /usr/local/bin/transcoding-daemon.py <<'PYTHON_EOF'
#!/usr/bin/env python3
"""
Automated Video Transcoding Daemon
Monitors directory for new videos and transcodes them for Plex
"""

import os
import sys
import time
import json
import logging
import subprocess
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
import threading
import queue

import psycopg2
from psycopg2.extras import Json
import redis
import requests

# Configuration
WATCH_DIR = "/nextcloud/plex-ingest"
OUTPUT_DIR = "/opt/plex/movies"
WORK_DIR = "/opt/plex/transcode/work"
LOG_FILE = "/var/log/transcoding/daemon.log"
MAX_PARALLEL = 2
SCAN_INTERVAL = 30
CPU_LIMIT_PERCENT = 80

# Database Configuration
DB_HOST = "46.250.243.123"
DB_PORT = "5432"
DB_NAME = "mcp_ecosystem"
DB_USER = "mcp_admin"
DB_PASSWORD = "TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0="

# Redis Configuration
REDIS_HOST = "localhost"
REDIS_PORT = 6379

# Plex Configuration
PLEX_URL = "http://localhost:32400"

# Supported formats
SUPPORTED_FORMATS = {'.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'}

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Job queue
job_queue = queue.Queue()
active_jobs = []
active_jobs_lock = threading.Lock()


class TranscodingJob:
    """Represents a transcoding job"""

    def __init__(self, input_path: str):
        self.input_path = input_path
        self.input_file = Path(input_path)
        self.job_id = self._generate_job_id()
        self.output_file = self._generate_output_path()
        self.work_file = Path(WORK_DIR) / f"{self.job_id}.mp4"
        self.start_time = None
        self.end_time = None
        self.status = "pending"
        self.progress = 0
        self.error = None

    def _generate_job_id(self) -> str:
        """Generate unique job ID"""
        timestamp = datetime.now().isoformat()
        content = f"{self.input_file.name}{timestamp}"
        return hashlib.md5(content.encode()).hexdigest()[:16]

    def _generate_output_path(self) -> Path:
        """Generate output file path"""
        # Remove original extension and add .mp4
        base_name = self.input_file.stem
        # Sanitize filename
        safe_name = "".join(c for c in base_name if c.isalnum() or c in (' ', '-', '_')).strip()
        return Path(OUTPUT_DIR) / f"{safe_name}.mp4"

    def get_metadata(self) -> Dict:
        """Get video metadata using ffprobe"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                str(self.input_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return json.loads(result.stdout)
        except Exception as e:
            logger.error(f"Failed to get metadata for {self.input_path}: {e}")
            return {}

    def transcode(self) -> bool:
        """Perform transcoding"""
        try:
            self.status = "transcoding"
            self.start_time = datetime.now()

            logger.info(f"Starting transcoding: {self.input_file.name} -> {self.output_file.name}")

            # Build ffmpeg command
            cmd = [
                'nice', '-n', '10',  # Lower priority
                'ffmpeg',
                '-i', str(self.input_path),
                '-c:v', 'libx265',
                '-preset', 'medium',
                '-crf', '23',
                '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                '-y',  # Overwrite output
                str(self.work_file)
            ]

            # Run transcoding
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )

            # Monitor progress
            for line in process.stderr:
                if 'time=' in line:
                    # Extract progress information
                    logger.debug(f"Progress: {line.strip()}")

            # Wait for completion
            return_code = process.wait()

            if return_code == 0:
                # Move to final destination
                self.work_file.rename(self.output_file)
                self.end_time = datetime.now()
                self.status = "completed"

                duration = (self.end_time - self.start_time).total_seconds()
                logger.info(f"Transcoding completed in {duration:.1f}s: {self.output_file.name}")

                # Delete original file
                self.input_file.unlink()
                logger.info(f"Deleted original file: {self.input_file.name}")

                return True
            else:
                stderr = process.stderr.read()
                raise Exception(f"FFmpeg failed with code {return_code}: {stderr}")

        except Exception as e:
            self.status = "failed"
            self.error = str(e)
            self.end_time = datetime.now()
            logger.error(f"Transcoding failed for {self.input_file.name}: {e}")

            # Cleanup work file
            if self.work_file.exists():
                self.work_file.unlink()

            return False


class DatabaseLogger:
    """Log transcoding jobs to PostgreSQL"""

    def __init__(self):
        self.conn = None
        self._connect()

    def _connect(self):
        """Connect to database"""
        try:
            self.conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
            logger.info("Connected to PostgreSQL database")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")

    def log_job(self, job: TranscodingJob):
        """Log job to database"""
        if not self.conn:
            return

        try:
            cursor = self.conn.cursor()

            # Create table if not exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS transcoding_jobs (
                    job_id VARCHAR(16) PRIMARY KEY,
                    input_file TEXT,
                    output_file TEXT,
                    status VARCHAR(20),
                    start_time TIMESTAMP,
                    end_time TIMESTAMP,
                    duration_seconds INTEGER,
                    error TEXT,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            duration = None
            if job.start_time and job.end_time:
                duration = int((job.end_time - job.start_time).total_seconds())

            # Insert or update job
            cursor.execute("""
                INSERT INTO transcoding_jobs
                (job_id, input_file, output_file, status, start_time, end_time, duration_seconds, error, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (job_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    end_time = EXCLUDED.end_time,
                    duration_seconds = EXCLUDED.duration_seconds,
                    error = EXCLUDED.error
            """, (
                job.job_id,
                str(job.input_path),
                str(job.output_file),
                job.status,
                job.start_time,
                job.end_time,
                duration,
                job.error,
                Json(job.get_metadata())
            ))

            self.conn.commit()
            logger.debug(f"Logged job {job.job_id} to database")

        except Exception as e:
            logger.error(f"Failed to log job to database: {e}")
            self.conn.rollback()


class RedisPublisher:
    """Publish transcoding events to Redis"""

    def __init__(self):
        try:
            self.redis = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
            self.redis.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            self.redis = None

    def publish_event(self, event_type: str, job: TranscodingJob):
        """Publish event to Redis"""
        if not self.redis:
            return

        try:
            event = {
                'type': event_type,
                'job_id': job.job_id,
                'input_file': str(job.input_file.name),
                'output_file': str(job.output_file.name),
                'status': job.status,
                'timestamp': datetime.now().isoformat()
            }

            self.redis.publish('transcoding:events', json.dumps(event))
            logger.debug(f"Published event: {event_type}")

        except Exception as e:
            logger.error(f"Failed to publish to Redis: {e}")


class PlexUpdater:
    """Update Plex library after transcoding"""

    def __init__(self):
        self.plex_token = self._get_plex_token()

    def _get_plex_token(self) -> Optional[str]:
        """Get Plex authentication token"""
        try:
            # Try to read from Plex preferences
            prefs_file = Path("/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml")
            if prefs_file.exists():
                import xml.etree.ElementTree as ET
                tree = ET.parse(prefs_file)
                root = tree.getroot()
                token = root.get('PlexOnlineToken')
                if token:
                    logger.info("Found Plex token from preferences")
                    return token
        except Exception as e:
            logger.warning(f"Could not read Plex token: {e}")

        return None

    def refresh_library(self):
        """Trigger Plex library scan"""
        if not self.plex_token:
            logger.warning("No Plex token available - skipping library refresh")
            return

        try:
            url = f"{PLEX_URL}/library/sections/all/refresh"
            headers = {'X-Plex-Token': self.plex_token}

            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                logger.info("Plex library refresh triggered")
            else:
                logger.warning(f"Plex library refresh failed: {response.status_code}")

        except Exception as e:
            logger.error(f"Failed to refresh Plex library: {e}")


def worker_thread(db_logger: DatabaseLogger, redis_pub: RedisPublisher, plex_updater: PlexUpdater):
    """Worker thread for processing transcoding jobs"""
    logger.info("Worker thread started")

    while True:
        try:
            # Get job from queue (blocking)
            job = job_queue.get()

            if job is None:  # Shutdown signal
                break

            # Add to active jobs
            with active_jobs_lock:
                active_jobs.append(job)

            # Log start
            db_logger.log_job(job)
            redis_pub.publish_event('started', job)

            # Perform transcoding
            success = job.transcode()

            # Log completion
            db_logger.log_job(job)
            redis_pub.publish_event('completed' if success else 'failed', job)

            # Update Plex if successful
            if success:
                plex_updater.refresh_library()

            # Remove from active jobs
            with active_jobs_lock:
                active_jobs.remove(job)

            # Mark job as done
            job_queue.task_done()

        except Exception as e:
            logger.error(f"Worker thread error: {e}")


def scan_for_videos() -> List[Path]:
    """Scan watch directory for video files"""
    videos = []

    try:
        for entry in Path(WATCH_DIR).iterdir():
            if entry.is_file() and entry.suffix.lower() in SUPPORTED_FORMATS:
                # Check if file is complete (not being written)
                try:
                    size1 = entry.stat().st_size
                    time.sleep(1)
                    size2 = entry.stat().st_size

                    if size1 == size2 and size1 > 0:
                        videos.append(entry)
                except:
                    pass

    except Exception as e:
        logger.error(f"Error scanning directory: {e}")

    return videos


def main():
    """Main daemon loop"""
    logger.info("Transcoding daemon starting...")

    # Initialize components
    db_logger = DatabaseLogger()
    redis_pub = RedisPublisher()
    plex_updater = PlexUpdater()

    # Start worker threads
    workers = []
    for i in range(MAX_PARALLEL):
        t = threading.Thread(
            target=worker_thread,
            args=(db_logger, redis_pub, plex_updater),
            daemon=True
        )
        t.start()
        workers.append(t)
        logger.info(f"Started worker thread {i+1}/{MAX_PARALLEL}")

    # Main loop
    logger.info("Starting main monitoring loop...")

    try:
        while True:
            # Scan for new videos
            videos = scan_for_videos()

            # Queue new jobs
            for video in videos:
                # Check if already queued or processing
                video_str = str(video)

                # Check active jobs
                with active_jobs_lock:
                    if any(job.input_path == video_str for job in active_jobs):
                        continue

                # Create and queue job
                job = TranscodingJob(video_str)
                job_queue.put(job)
                logger.info(f"Queued: {video.name} (Queue size: {job_queue.qsize()})")

            # Log status
            with active_jobs_lock:
                active_count = len(active_jobs)

            if active_count > 0:
                logger.info(f"Active jobs: {active_count}, Queue size: {job_queue.qsize()}")

            # Sleep before next scan
            time.sleep(SCAN_INTERVAL)

    except KeyboardInterrupt:
        logger.info("Shutdown signal received")
    finally:
        # Cleanup
        logger.info("Stopping worker threads...")
        for _ in range(MAX_PARALLEL):
            job_queue.put(None)

        for worker in workers:
            worker.join(timeout=30)

        logger.info("Transcoding daemon stopped")


if __name__ == '__main__':
    main()
PYTHON_EOF

    chmod +x /usr/local/bin/transcoding-daemon.py

    log_success "Transcoding daemon created"
}

create_systemd_service() {
    log_section "Creating systemd service..."

    # Create service file
    cat > /etc/systemd/system/transcoding-daemon.service <<EOF
[Unit]
Description=Automated Video Transcoding Daemon
After=network.target plexmediaserver.service postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/bin/transcoding-daemon.py
Restart=always
RestartSec=10s

# Resource limits
MemoryLimit=${MEMORY_LIMIT_GB}G
CPUQuota=${CPU_LIMIT_PERCENT}%

# Security
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=append:/var/log/transcoding/service.log
StandardError=append:/var/log/transcoding/service-error.log

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    log_success "Systemd service created"
}

create_management_scripts() {
    log_section "Creating management scripts..."

    # Status script
    cat > /usr/local/bin/transcoding-status.sh <<'EOF'
#!/bin/bash
# Show transcoding status

echo "Transcoding Service Status"
echo "=========================="
systemctl status transcoding-daemon.service --no-pager
echo ""

echo "Active Jobs"
echo "==========="
ps aux | grep ffmpeg | grep -v grep || echo "No active transcoding jobs"
echo ""

echo "Queue Status"
echo "============"
if command -v psql &>/dev/null; then
    PGPASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=" \
    psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c \
    "SELECT job_id, input_file, status,
            EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds,
            created_at
     FROM transcoding_jobs
     ORDER BY created_at DESC
     LIMIT 10;" 2>/dev/null || echo "Database not available"
fi
echo ""

echo "Watched Directory"
echo "================="
ls -lh /nextcloud/plex-ingest/ 2>/dev/null || echo "Directory not accessible"
EOF

    chmod +x /usr/local/bin/transcoding-status.sh

    # Log viewer script
    cat > /usr/local/bin/transcoding-logs.sh <<'EOF'
#!/bin/bash
# View transcoding logs

LOG_FILE="/var/log/transcoding/daemon.log"

if [[ "$1" == "-f" ]] || [[ "$1" == "--follow" ]]; then
    tail -f "$LOG_FILE"
else
    tail -n 100 "$LOG_FILE"
fi
EOF

    chmod +x /usr/local/bin/transcoding-logs.sh

    log_success "Management scripts created"
}

start_service() {
    log_section "Starting transcoding service..."

    # Enable service
    systemctl enable transcoding-daemon.service

    # Start service
    systemctl start transcoding-daemon.service

    # Wait for service to start
    sleep 3

    # Check status
    if systemctl is-active --quiet transcoding-daemon.service; then
        log_success "Transcoding daemon is running"
    else
        log_error "Transcoding daemon failed to start"
        journalctl -u transcoding-daemon.service -n 50
        return 1
    fi
}

verify_installation() {
    log_section "Verifying installation..."

    local checks_passed=0
    local checks_total=7

    # Check 1: FFmpeg installed
    if command -v ffmpeg &>/dev/null; then
        log_success "FFmpeg is installed"
        ((checks_passed++))
    else
        log_error "FFmpeg is not installed"
    fi

    # Check 2: Python dependencies
    if python3 -c "import watchdog, psycopg2, redis" 2>/dev/null; then
        log_success "Python dependencies installed"
        ((checks_passed++))
    else
        log_error "Python dependencies missing"
    fi

    # Check 3: Service running
    if systemctl is-active --quiet transcoding-daemon.service; then
        log_success "Transcoding daemon is running"
        ((checks_passed++))
    else
        log_error "Transcoding daemon is not running"
    fi

    # Check 4: Watch directory exists
    if [[ -d "$WATCH_DIR" ]]; then
        log_success "Watch directory exists"
        ((checks_passed++))
    else
        log_error "Watch directory not found"
    fi

    # Check 5: Output directory exists
    if [[ -d "$OUTPUT_DIR" ]]; then
        log_success "Output directory exists"
        ((checks_passed++))
    else
        log_error "Output directory not found"
    fi

    # Check 6: Database connectivity
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
        log_success "Database connection successful"
        ((checks_passed++))
    else
        log_warning "Database connection failed (non-critical)"
    fi

    # Check 7: Redis connectivity
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then
        log_success "Redis connection successful"
        ((checks_passed++))
    else
        log_warning "Redis connection failed (non-critical)"
    fi

    echo
    log_info "Verification: ${checks_passed}/${checks_total} checks passed"

    if [[ $checks_passed -ge 5 ]]; then
        log_success "Essential verification checks passed!"
        return 0
    else
        log_warning "Some verification checks failed"
        return 1
    fi
}

save_configuration() {
    log_section "Saving configuration..."

    local config_file="/root/transcoding-deployment-info.txt"

    cat > "$config_file" <<EOF
Automated Transcoding Service Configuration
============================================
Date: $(date)
Server: VMI02D (46.250.241.70)

Directory Configuration:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Watch Directory:   ${WATCH_DIR}
Output Directory:  ${OUTPUT_DIR}
Work Directory:    ${TRANSCODE_WORK_DIR}
Log Directory:     ${LOG_DIR}

Transcoding Settings:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target Codec:      ${TARGET_CODEC} (H.265/HEVC)
Target Resolution: ${TARGET_RESOLUTION} (1080p)
Quality (CRF):     ${TARGET_CRF}
Audio Codec:       ${TARGET_AUDIO_CODEC}
Audio Bitrate:     ${TARGET_AUDIO_BITRATE}

Performance Settings:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Max Parallel Jobs: ${MAX_PARALLEL_JOBS}
CPU Limit:         ${CPU_LIMIT_PERCENT}%
Memory Limit:      ${MEMORY_LIMIT_GB}GB
Scan Interval:     ${SCAN_INTERVAL}s

Service Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service Name:      transcoding-daemon.service
Daemon Script:     /usr/local/bin/transcoding-daemon.py
Log File:          ${LOG_DIR}/daemon.log

Database Logging:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Host:              ${DB_HOST}
Database:          ${DB_NAME}
Table:             transcoding_jobs

Management Commands:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service Status:    systemctl status transcoding-daemon
Start Service:     systemctl start transcoding-daemon
Stop Service:      systemctl stop transcoding-daemon
Restart Service:   systemctl restart transcoding-daemon
View Status:       /usr/local/bin/transcoding-status.sh
View Logs:         /usr/local/bin/transcoding-logs.sh
Follow Logs:       /usr/local/bin/transcoding-logs.sh -f

Workflow:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Upload video to ${WATCH_DIR}
2. Daemon detects new file every ${SCAN_INTERVAL}s
3. Transcode to H.265 1080p (max ${MAX_PARALLEL_JOBS} parallel)
4. Move transcoded file to ${OUTPUT_DIR}
5. Delete original file
6. Update Plex library
7. Log to PostgreSQL and Redis

Supported Formats:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${SUPPORTED_FORMATS[@]}
EOF

    chmod 600 "$config_file"

    log_success "Configuration saved to $config_file"
}

print_summary() {
    log_section "Deployment Summary"

    cat <<EOF

${GREEN}Automated Transcoding Service has been successfully deployed!${NC}

${BOLD}Service Status:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service:           transcoding-daemon.service
Status:            $(systemctl is-active transcoding-daemon.service || echo "INACTIVE")

${BOLD}Workflow:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Upload video:   ${WATCH_DIR}
2. Auto-transcode: H.265 1080p CRF ${TARGET_CRF}
3. Output:         ${OUTPUT_DIR}
4. Update Plex:    Automatic library refresh

${BOLD}Performance:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Max Parallel:      ${MAX_PARALLEL_JOBS} jobs
CPU Limit:         ${CPU_LIMIT_PERCENT}%
Memory Limit:      ${MEMORY_LIMIT_GB}GB
Scan Interval:     ${SCAN_INTERVAL}s

${BOLD}Management Commands:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status:            /usr/local/bin/transcoding-status.sh
Logs:              /usr/local/bin/transcoding-logs.sh
Follow Logs:       /usr/local/bin/transcoding-logs.sh -f
Service Control:   systemctl {start|stop|restart|status} transcoding-daemon

${BOLD}Test Workflow:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Upload test video to ${WATCH_DIR}
2. Monitor: /usr/local/bin/transcoding-logs.sh -f
3. Wait for transcoding to complete
4. Check output: ls -lh ${OUTPUT_DIR}
5. Verify Plex library updated
6. Check database: /usr/local/bin/transcoding-status.sh

${BOLD}Configuration File:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Location:          /root/transcoding-deployment-info.txt

${BOLD}Next Steps:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Test with a sample video file
2. Monitor logs during first transcoding
3. Verify Plex library updates automatically
4. Adjust CPU/memory limits if needed
5. Configure monitoring alerts

EOF
}

#==============================================================================
# MAIN EXECUTION
#==============================================================================
main() {
    log_section "Automated Transcoding Service v${SCRIPT_VERSION}"

    # Pre-flight checks
    check_root
    check_os
    check_directories

    # Check dependencies
    if ! check_dependencies; then
        log_info "Installing missing dependencies..."
    fi

    # Installation steps
    install_ffmpeg
    install_python_dependencies
    create_directories
    create_transcoding_daemon
    create_systemd_service
    create_management_scripts
    start_service
    save_configuration

    # Verification
    verify_installation

    # Summary
    print_summary

    log_success "Automated transcoding service deployment completed successfully!"
}

# Run main function
main "$@"
