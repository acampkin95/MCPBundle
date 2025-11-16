#!/usr/bin/env bash
#
# whitelist-hotfix.sh
# --------------------
# Emergency helper to re-whitelist a management workstation (by IP + optional MAC)
# across the three MCP SOC nodes (VMI01, VMI02D, VMI03). Designed for the
# "locked out" scenario where you can still reach VMI02D via VNC/console.
#
# Usage (run as root on VMI02D):
#   curl -sSf https://raw.githubusercontent.com/<org>/MCP-Bundle/main/deployment/soc/whitelist-hotfix.sh \
#     | bash -s -- --ip 203.0.113.44 --password $MCP_ROOT_PASSWORD
#
# Options:
#   --ip / -i           Public IPv4 address that should regain SSH/HTTPS access
#   --mac / -m          Layer2 MAC to log/whitelist (default: 6e:d9:d3:17:f6:48)
#   --password / -p     Root password for VMI01 & VMI03 (env MCP_ROOT_PASSWORD)
#   --stale-ip          One or more comma-separated IPs to purge (default old SOC IP)
#   --local-host        Override hostname treated as "local" (default data.acdev.host)
#   --local-ip          Override VMI02D public IP (default 46.250.241.70)
#
# The script updates /etc/nftables.d/base.nft on every node, removes the
# deprecated 58.105.139.107 entry, inserts your supplied IP/MAC, reloads nftables,
# and verifies the new rule is active. Remote calls use sshpass to feed the
# provided root password automatically.

set -euo pipefail

DEFAULT_MAC="6e:d9:d3:17:f6:48"
DEFAULT_STALE_IP="58.105.139.107"
DEFAULT_LOCAL_HOST="data.acdev.host"
DEFAULT_LOCAL_IP="46.250.241.70"

HOST_MATRIX=(
  "VMI01|acdev.host|46.250.243.123|remote"
  "VMI02D|data.acdev.host|46.250.241.70|local"
  "VMI03|auth.acdev.host|154.26.158.31|remote"
)

usage() {
  cat <<USAGE
Usage: whitelist-hotfix.sh [options]

Options:
  -i, --ip <address>         Required. Public IPv4 to whitelist.
  -m, --mac <mac>            Optional. MAC address to log/allow (default preset).
  -p, --password <secret>    Optional. Root password for remote SSH. Will prompt.
      --stale-ip <csv>       Optional. IP(s) to purge from whitelist set.
      --local-host <name>    Optional. Hostname treated as local context.
      --local-ip <address>   Optional. Public IP of the local host.
  -h, --help                 Show this help.

Environment overrides: MCP_WHITELIST_IP, MCP_WHITELIST_MAC, MCP_ROOT_PASSWORD,
MCP_STALE_IP, MCP_LOCAL_HOSTNAME, MCP_LOCAL_PUBLIC_IP.
USAGE
}

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "[!] Run this script as root (needed to edit nftables)." >&2
    exit 1
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[!] Missing dependency: $1" >&2
    exit 1
  fi
}

ensure_sshpass() {
  if command -v sshpass >/dev/null 2>&1; then
    return
  fi
  echo "[*] Installing sshpass (apt)."
  apt-get update -y >/dev/null
  apt-get install -y sshpass >/dev/null
}

confirm_ipv4() {
  local candidate=$1
  if [[ ! $candidate =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    return 1
  fi
  IFS=. read -r -a octets <<<"$candidate"
  for oct in "${octets[@]}"; do
    if (( oct < 0 || oct > 255 )); then
      return 1
    fi
  done
  return 0
}

confirm_mac() {
  local candidate=$1
  [[ $candidate =~ ^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$ ]]
}

parse_args() {
  MGMT_IP=${MCP_WHITELIST_IP:-}
  MGMT_MAC=${MCP_WHITELIST_MAC:-$DEFAULT_MAC}
  ROOT_PASSWORD=${MCP_ROOT_PASSWORD:-}
  STALE_IP=${MCP_STALE_IP:-$DEFAULT_STALE_IP}
  LOCAL_HOSTNAME=${MCP_LOCAL_HOSTNAME:-$DEFAULT_LOCAL_HOST}
  LOCAL_PUBLIC_IP=${MCP_LOCAL_PUBLIC_IP:-$DEFAULT_LOCAL_IP}

  while [[ $# -gt 0 ]]; do
    case $1 in
      -i|--ip)
        MGMT_IP=$2; shift 2 ;;
      -m|--mac)
        MGMT_MAC=$2; shift 2 ;;
      -p|--password)
        ROOT_PASSWORD=$2; shift 2 ;;
      --stale-ip)
        STALE_IP=$2; shift 2 ;;
      --local-host)
        LOCAL_HOSTNAME=$2; shift 2 ;;
      --local-ip)
        LOCAL_PUBLIC_IP=$2; shift 2 ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        echo "[!] Unknown argument: $1" >&2
        usage
        exit 1 ;;
    esac
  done

  if [[ -z ${MGMT_IP} ]]; then
    read -rp "Enter the public IPv4 you want to whitelist: " MGMT_IP
  fi

  if ! confirm_ipv4 "$MGMT_IP"; then
    echo "[!] Invalid IPv4 address: $MGMT_IP" >&2
    exit 1
  fi

  if [[ -z ${MGMT_MAC} ]]; then
    MGMT_MAC=$DEFAULT_MAC
  fi
  MGMT_MAC=$(echo "$MGMT_MAC" | tr A-F a-f)
  if ! confirm_mac "$MGMT_MAC"; then
    echo "[!] Invalid MAC address: $MGMT_MAC" >&2
    exit 1
  fi

  if [[ -z ${ROOT_PASSWORD} ]]; then
    read -rsp "Enter root password for remote nodes: " ROOT_PASSWORD
    echo
  fi
}

emit_python_patch() {
  cat <<__PY__
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
mgmt_ip = sys.argv[2]
mgmt_mac = sys.argv[3].strip().lower()
stale_values = {v.strip() for v in sys.argv[4].split(,) if v.strip()}

lines = path.read_text().splitlines()

def rewrite_whitelist(buffer):
  for idx, line in enumerate(buffer):
    if #
