#!/bin/bash
###############################################################################
# Enable SCP Access for AccessService User on VMI02D
# Purpose: Allow both rsync and scp for the AccessService user
# Target: VMI02D (46.250.241.70)
# Date: 2025-11-07
###############################################################################

set -e

echo "═══════════════════════════════════════════════════════════════════"
echo "  Enable SCP Access for AccessService User"
echo "  Server: VMI02D (46.250.241.70)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "==> Step 1: Backup current SSH configuration"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup-$(date +%Y%m%d-%H%M%S)
echo -e "${GREEN}✓ Backup created${NC}"

echo ""
echo "==> Step 2: Create new wrapper script for rsync and scp"

cat > /usr/local/bin/rsync-scp-wrapper <<'EOF'
#!/bin/bash
set -euo pipefail

ALLOWED_DIR="/srv/rsync-drop/AccessService/incoming"
LOGGER_TAG="rsync-scp-wrapper"

# Log the command
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  /usr/bin/logger -t "$LOGGER_TAG" "user=$USER cmd=${SSH_ORIGINAL_COMMAND}"
fi

# If no command, deny interactive shell
if [[ -z "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  echo "Interactive shell access is disabled." >&2
  exit 1
fi

# Parse the command
read -ra ARGS <<< "${SSH_ORIGINAL_COMMAND}"
CMD="${ARGS[0]:-}"

# Allow rsync
if [[ "$CMD" == "rsync" && "${ARGS[1]:-}" == "--server" ]]; then
  # Security checks for rsync
  for arg in "${ARGS[@]}"; do
    case "$arg" in
      --sender|--daemon|--delete|--delete-*|--remove-*|--partial-dir*|--write-devices* )
        echo "rsync: Option $arg is not permitted." >&2
        exit 1
        ;;
      --rsync-path*|--address*|--config*|--password-file*|--files-from*|--log-file*|--temp-dir*|--rsh*|--protect-args|--chmod*|--chown* )
        echo "rsync: Option $arg is blocked." >&2
        exit 1
        ;;
      -e)
        echo "rsync: Remote shell overrides are disabled." >&2
        exit 1
        ;;
    esac
    if [[ "$arg" == *".."* ]]; then
      echo "rsync: Path traversal detected." >&2
      exit 1
    fi
    if [[ "$arg" == /* ]]; then
      echo "rsync: Absolute paths are disallowed." >&2
      exit 1
    fi
  done

  # Ensure destination is current directory
  if [[ "${ARGS[-1]}" != "." ]]; then
    echo "rsync: Destination must be current directory." >&2
    exit 1
  fi

  cd "$ALLOWED_DIR"
  /usr/bin/rsync "${ARGS[@]}"

  # Enforce ZIP-only uploads
  if find "$ALLOWED_DIR" -maxdepth 1 -type f ! -name "*.zip" -print -quit | grep -q .; then
    find "$ALLOWED_DIR" -maxdepth 1 -type f ! -name "*.zip" -delete
    echo "rsync: Only .zip uploads are allowed." >&2
    exit 1
  fi

  exit 0
fi

# Allow scp
if [[ "$CMD" == "scp" ]]; then
  # Security checks for scp
  for arg in "${ARGS[@]}"; do
    # Block dangerous scp flags
    case "$arg" in
      -3)
        echo "scp: Third-party transfers are not allowed." >&2
        exit 1
        ;;
    esac
    # Check for path traversal
    if [[ "$arg" == *".."* ]]; then
      echo "scp: Path traversal detected." >&2
      exit 1
    fi
  done

  # Change to allowed directory
  cd "$ALLOWED_DIR"

  # Execute scp with the original command
  exec $SSH_ORIGINAL_COMMAND

  # Note: ZIP-only restriction not enforced for scp to maintain compatibility
  # You can add post-upload checks if needed
  exit 0
fi

# Deny everything else
echo "Only rsync and scp are permitted." >&2
exit 1
EOF

chmod +x /usr/local/bin/rsync-scp-wrapper
echo -e "${GREEN}✓ Wrapper script created${NC}"

echo ""
echo "==> Step 3: Update SSH configuration"

# Remove old AccessService configuration and add new one
sed -i '/^Match User AccessService$/,/^$/d' /etc/ssh/sshd_config

cat >> /etc/ssh/sshd_config <<'EOF'

# AccessService user configuration - rsync and scp access
Match User AccessService
    ForceCommand /usr/local/bin/rsync-scp-wrapper
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitTTY no
    PasswordAuthentication yes
EOF

echo -e "${GREEN}✓ SSH configuration updated${NC}"

echo ""
echo "==> Step 4: Validate SSH configuration"
sshd -t
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ SSH configuration is valid${NC}"
else
    echo -e "${RED}✗ SSH configuration has errors - reverting${NC}"
    cp /etc/ssh/sshd_config.backup-* /etc/ssh/sshd_config
    exit 1
fi

echo ""
echo "==> Step 5: Restart SSH service"
systemctl restart sshd
echo -e "${GREEN}✓ SSH service restarted${NC}"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Configuration Complete!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "AccessService user can now use:"
echo "  • rsync (upload-only, .zip files only)"
echo "  • scp (upload/download)"
echo ""
echo "Usage examples:"
echo ""
echo "  # rsync upload"
echo "  rsync -avz myfile.zip AccessService@46.250.241.70:"
echo ""
echo "  # scp upload"
echo "  scp myfile.zip AccessService@46.250.241.70:incoming/"
echo ""
echo "  # scp download"
echo "  scp AccessService@46.250.241.70:incoming/myfile.zip ./"
echo ""
echo "Note: All operations are logged to syslog with tag 'rsync-scp-wrapper'"
echo ""
