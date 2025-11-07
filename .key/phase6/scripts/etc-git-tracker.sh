#!/bin/bash
#
# /etc Configuration Tracker
# Automatically tracks changes to /etc in git
# Commits changes daily and pushes to S3 as git bundle
#
# Usage: ./etc-git-tracker.sh [--init] [--commit] [--push-to-s3]
#

set -euo pipefail

HOSTNAME=$(hostname -s)
ETC_GIT_DIR="/etc"
S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_PATH="${S3_BUCKET}/${HOSTNAME}/etc-history"
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"

LOG_FILE="/var/log/etc-git-tracker.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

init_git_repo() {
    log "Initializing git repository in /etc"

    cd "${ETC_GIT_DIR}"

    if [ -d .git ]; then
        log "Git repository already exists"
        return 0
    fi

    # Initialize repo
    git init

    # Configure
    git config user.name "System Backup"
    git config user.email "backup@${HOSTNAME}"

    # Create .gitignore
    cat > .gitignore <<'EOF'
# Shadow files
shadow
shadow-
gshadow
gshadow-
passwd-
group-

# Sensitive files
*.key
*.pem
*.p12
*.pfx
ssl/private/*

# Temporary files
*.swp
*.tmp
*~
.*.swp

# Large binary files
*.db
*.sqlite

# Cache
apt/archives/*
apt/lists/*
EOF

    # Initial commit
    git add .
    git commit -m "Initial commit of /etc configuration

Hostname: ${HOSTNAME}
Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

Automated by etc-git-tracker
"

    log "Git repository initialized"
}

commit_changes() {
    log "Checking for changes in /etc"

    cd "${ETC_GIT_DIR}"

    if [ ! -d .git ]; then
        log "ERROR: Git repository not initialized"
        return 1
    fi

    # Check for changes
    if git diff --quiet && git diff --cached --quiet; then
        # Check for untracked files
        if [ -z "$(git ls-files --others --exclude-standard)" ]; then
            log "No changes detected"
            return 0
        fi
    fi

    # Add all changes
    git add -A

    # Get change summary
    local added=$(git diff --cached --numstat | wc -l)
    local modified=$(git diff --cached --name-only | wc -l)

    if [ "${modified}" -eq 0 ]; then
        log "No changes to commit"
        return 0
    fi

    # Create detailed commit message
    local commit_msg="Configuration changes on ${HOSTNAME}

Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
User: ${SUDO_USER:-root}
Files modified: ${modified}

Changed files:
$(git diff --cached --name-only | head -20 | sed 's/^/  - /')
$([ "${modified}" -gt 20 ] && echo "  ... and $((modified - 20)) more files")

Automated commit by etc-git-tracker
"

    # Commit
    git commit -m "${commit_msg}"

    log "Committed ${modified} file changes"
}

push_to_s3() {
    log "Pushing /etc git history to S3"

    cd "${ETC_GIT_DIR}"

    if [ ! -d .git ]; then
        log "ERROR: Git repository not initialized"
        return 1
    fi

    # Create git bundle
    local bundle_name="etc-history_${HOSTNAME}_$(date +%Y-%m-%d).bundle"
    local bundle_path="/tmp/${bundle_name}"

    # Create bundle of all branches
    git bundle create "${bundle_path}" --all

    # Upload to S3
    if rclone copy "${bundle_path}" "${S3_REMOTE}:${S3_PATH}/" --config "${RCLONE_CONFIG}"; then
        log "Successfully pushed git bundle to S3: ${bundle_name}"

        # Keep latest bundle as "current"
        rclone copy "${bundle_path}" "${S3_REMOTE}:${S3_PATH}/etc-history_${HOSTNAME}_current.bundle" \
            --config "${RCLONE_CONFIG}"
    else
        log "ERROR: Failed to push to S3"
        return 1
    fi

    # Cleanup
    rm -f "${bundle_path}"

    # Cleanup old bundles (keep last 30 days)
    local cutoff_date=$(date -d "30 days ago" +%Y-%m-%d)

    rclone lsf "${S3_REMOTE}:${S3_PATH}" --config "${RCLONE_CONFIG}" | \
        grep "^etc-history_${HOSTNAME}_[0-9]" | \
        while read -r bundle; do
            # Extract date from filename
            local bundle_date=$(echo "${bundle}" | grep -oP '[0-9]{4}-[0-9]{2}-[0-9]{2}')

            if [[ "${bundle_date}" < "${cutoff_date}" ]]; then
                log "Deleting old bundle: ${bundle}"
                rclone delete "${S3_REMOTE}:${S3_PATH}/${bundle}" --config "${RCLONE_CONFIG}"
            fi
        done
}

restore_from_s3() {
    log "Restoring /etc git history from S3"

    local bundle_path="/tmp/etc-history-restore.bundle"

    # Download latest bundle
    if ! rclone copy "${S3_REMOTE}:${S3_PATH}/etc-history_${HOSTNAME}_current.bundle" \
        "${bundle_path}" --config "${RCLONE_CONFIG}"; then
        log "ERROR: Failed to download git bundle from S3"
        return 1
    fi

    cd "${ETC_GIT_DIR}"

    # Clone from bundle
    if [ -d .git ]; then
        log "WARNING: Git repository already exists, fetching updates"
        git fetch "${bundle_path}"
    else
        git clone "${bundle_path}" .
    fi

    rm -f "${bundle_path}"

    log "Git history restored from S3"
}

generate_rebuild_playbook() {
    log "Generating rebuild playbook from current state"

    local playbook_dir="/tmp/rebuild-playbook"
    local playbook_file="${playbook_dir}/${HOSTNAME}-rebuild-playbook.yml"

    mkdir -p "${playbook_dir}"

    # Create Ansible playbook
    cat > "${playbook_file}" <<EOF
---
# Rebuild Playbook for ${HOSTNAME}
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# This playbook can be used to recreate this system from scratch

- name: Rebuild ${HOSTNAME}
  hosts: ${HOSTNAME}
  become: yes

  vars:
    hostname: ${HOSTNAME}
    os_version: "$(cat /etc/os-release | grep VERSION_ID | cut -d= -f2 | tr -d '"')"

  tasks:
    # System packages
    - name: Install system packages
      apt:
        name: "{{ item }}"
        state: present
      loop:
$(apt-mark showmanual | sed 's/^/        - /')

    # Enabled services
    - name: Enable system services
      systemd:
        name: "{{ item }}"
        enabled: yes
      loop:
$(systemctl list-unit-files --state=enabled --no-pager --no-legend | awk '{print $1}' | grep -v '@' | sed 's/^/        - /')

    # Network configuration
    - name: Configure network interfaces
      copy:
        src: "files/etc/netplan/"
        dest: "/etc/netplan/"
      when: netplan_config_exists

    # Firewall rules
    - name: Configure firewall
      copy:
        src: "files/etc/iptables/"
        dest: "/etc/iptables/"
      when: iptables_config_exists

    # SSH configuration
    - name: Configure SSH
      copy:
        src: "files/etc/ssh/sshd_config"
        dest: "/etc/ssh/sshd_config"
        validate: "/usr/sbin/sshd -t -f %s"

    # Cron jobs
    - name: Configure cron jobs
      copy:
        src: "files/etc/cron.d/"
        dest: "/etc/cron.d/"

    # Custom configurations
    - name: Restore /etc configuration
      synchronize:
        src: "files/etc/"
        dest: "/etc/"
        archive: yes
        checksum: yes

  handlers:
    - name: restart ssh
      service:
        name: ssh
        state: restarted

    - name: reload systemd
      systemd:
        daemon_reload: yes
EOF

    # Create README
    cat > "${playbook_dir}/README.md" <<EOF
# ${HOSTNAME} Rebuild Playbook

Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Overview

This playbook can be used to recreate the ${HOSTNAME} system from a fresh Ubuntu installation.

## Prerequisites

1. Fresh Ubuntu $(cat /etc/os-release | grep VERSION_ID | cut -d= -f2 | tr -d '"') installation
2. Ansible installed on control machine
3. SSH access to target machine
4. /etc configuration files extracted from backup

## Usage

\`\`\`bash
# 1. Extract /etc from backup
cd files/
tar xzf /path/to/etc-backup.tar.gz

# 2. Run playbook
ansible-playbook -i inventory ${HOSTNAME}-rebuild-playbook.yml

# 3. Restore databases (if applicable)
# See RESTORE_GUIDE.md
\`\`\`

## Manual Steps

The following steps require manual intervention:

1. Restore database dumps (PostgreSQL, Redis)
2. Configure application-specific secrets
3. Update DNS records
4. Restore SSL certificates
5. Verify all services are running

## Generated Files

- ${HOSTNAME}-rebuild-playbook.yml: Main Ansible playbook
- files/: Configuration files from /etc
- inventory: Ansible inventory file

## Notes

This playbook captures the current system state as of $(date).
Always review and test in a non-production environment first.
EOF

    # Upload to S3
    tar czf "${playbook_dir}.tar.gz" -C "${playbook_dir}" .

    if rclone copy "${playbook_dir}.tar.gz" \
        "${S3_REMOTE}:${S3_PATH}/" --config "${RCLONE_CONFIG}"; then
        log "Rebuild playbook uploaded to S3"
    fi

    rm -rf "${playbook_dir}" "${playbook_dir}.tar.gz"
}

main() {
    local action="commit"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --init)
                action="init"
                shift
                ;;
            --commit)
                action="commit"
                shift
                ;;
            --push-to-s3)
                action="push"
                shift
                ;;
            --restore)
                action="restore"
                shift
                ;;
            --generate-playbook)
                action="playbook"
                shift
                ;;
            *)
                echo "Usage: $0 [--init|--commit|--push-to-s3|--restore|--generate-playbook]"
                exit 1
                ;;
        esac
    done

    case "${action}" in
        init)
            init_git_repo
            ;;
        commit)
            commit_changes
            ;;
        push)
            commit_changes
            push_to_s3
            ;;
        restore)
            restore_from_s3
            ;;
        playbook)
            generate_rebuild_playbook
            ;;
    esac
}

main "$@"
