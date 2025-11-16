# Whitelist Hotfix

Save the following script as `deployment/soc/whitelist-hotfix.sh` and run it from the VNC-accessible host (VMI02D) whenever SSH access is locked out.

```bash
#!/usr/bin/env bash
set -euo pipefail

DEFAULT_MAC="6e:d9:d3:17:f6:48"
DEFAULT_STALE_IP="58.105.139.107"

HOST_MATRIX=(
  "VMI01|acdev.host|46.250.243.123|remote"
  "VMI02D|data.acdev.host|46.250.241.70|local"
  "VMI03|auth.acdev.host|154.26.158.31|remote"
)

usage() {
  cat <<USAGE
Usage: whitelist-hotfix.sh --ip <public-ip> [options]

Options:
  -i, --ip <address>         Required. Public IPv4 to whitelist.
  -m, --mac <mac>            MAC address to log/allow (default 6e:d9:d3:17:f6:48)
  -p, --password <secret>    Root password for remote SSH (prompt if omitted)
      --stale-ip <csv>       Comma-separated stale IPs to purge (default 58.105.139.107)
  -h, --help                 Show this help

Env overrides: MCP_WHITELIST_IP, MCP_WHITELIST_MAC, MCP_ROOT_PASSWORD, MCP_STALE_IP.
USAGE
}

require_root() { (( EUID == 0 )) || { echo "[!] Run as root"; exit 1; }; }
confirm_ipv4() { [[ $1 =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1; IFS=. read -r a b c d <<<"$1"; for o in $a $b $c $d; do (( o>=0 && o<=255 )) || return 1; done; }
confirm_mac() { [[ $1 =~ ^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$ ]]; }
ensure_sshpass() { command -v sshpass >/dev/null 2>&1 || { apt-get update -y >/dev/null; apt-get install -y sshpass >/dev/null; }; }

emit_python_patch() {
  cat <<PY
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
mgmt_ip = sys.argv[2]
mgmt_mac = sys.argv[3].strip().lower()
stale_values = {v.strip() for v in sys.argv[4].split(,) if v.strip()}
lines = path.read_text().splitlines()

def rewrite_whitelist(buf):
  for idx, line in enumerate(buf):
    if #
```
