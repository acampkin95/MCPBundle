# WireGuard VPN Setup - Windows

## Prerequisites

- Windows 10 or later
- Administrator access

## Installation Steps

### 1. Install WireGuard

1. Download WireGuard from: https://www.wireguard.com/install/
2. Run the installer
3. Complete the installation wizard

### 2. Import Configuration

1. Open WireGuard application
2. Click "Import tunnel(s) from file"
3. Select your downloaded `mcp-vpn-*.conf` file
4. The tunnel will be added automatically

### 3. Activate VPN

1. Select the imported tunnel from the list
2. Click "Activate" button
3. Wait for connection to establish (status will show "Active")

### 4. Verify Connection

1. Open Command Prompt
2. Run: `ping 10.10.10.1`
3. You should receive replies from the VPN gateway

## Troubleshooting

### Connection Fails

- Check your internet connection
- Verify firewall isn't blocking WireGuard
- Ensure UDP port 51823 is not blocked

### DNS Not Working

- Go to tunnel settings
- Verify DNS is set to 10.10.10.1
- Try flushing DNS: `ipconfig /flushdns`

### Can't Access Resources

- Verify AllowedIPs includes required networks
- Check Windows Firewall settings
- Confirm VPN status is "Active"

## Support

Contact your system administrator for assistance.
