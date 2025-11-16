# WireGuard VPN Setup - macOS

## Prerequisites

- macOS 10.14 or later

## Installation Steps

### 1. Install WireGuard

1. Download from Mac App Store: https://apps.apple.com/us/app/wireguard/id1451685025
2. Or install via Homebrew: `brew install --cask wireguard-tools`
3. Open WireGuard application

### 2. Import Configuration

1. Click "Import tunnel(s) from file"
2. Select your downloaded `mcp-vpn-*.conf` file
3. Alternatively, click "+" and paste configuration

### 3. Activate VPN

1. Select the imported tunnel
2. Click toggle switch to activate
3. macOS will request permission - click "Allow"
4. Status will show "Active" when connected

### 4. Verify Connection

1. Open Terminal
2. Run: `ping 10.10.10.1`
3. You should receive replies

## Troubleshooting

### Permission Denied

- Grant VPN permissions in System Preferences
- Go to: System Preferences > Security & Privacy > VPN
- Allow WireGuard

### Connection Fails

- Check internet connection
- Verify firewall settings
- Restart WireGuard application

### DNS Issues

- Verify DNS setting: 10.10.10.1
- Flush DNS cache: `sudo dscacheutil -flushcache`

## Support

Contact your system administrator for assistance.
