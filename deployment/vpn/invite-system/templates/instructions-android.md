# WireGuard VPN Setup - Android

## Prerequisites

- Android 5.0 or later
- WireGuard app from Google Play Store

## Installation Steps

### Method 1: QR Code (Recommended)

1. Install WireGuard from Google Play Store
2. Open WireGuard app
3. Tap "+" button (bottom right)
4. Select "Scan from QR code"
5. Scan the QR code displayed on the website
6. Name your tunnel (e.g., "MCP VPN")
7. Tap "Create Tunnel"
8. Toggle switch to connect

### Method 2: Configuration File

1. Download the `.conf` file
2. Open WireGuard app
3. Tap "+" button
4. Select "Import from file or archive"
5. Navigate to and select the downloaded file
6. Toggle switch to connect

## Usage

### Connect to VPN

1. Open WireGuard app
2. Toggle the switch for "MCP VPN"
3. Android will request VPN permission (first time)
4. Tap "OK"
5. Status shows connected with transfer statistics

### Disconnect

1. Open WireGuard app
2. Toggle off the switch

## Features

### Statistics

- View real-time data transfer
- See last handshake time
- Monitor connection status

### On-Demand

- Enable "Always-on VPN" in Android settings
- Go to: Settings > Network & Internet > VPN
- Select WireGuard and enable "Always-on VPN"

## Troubleshooting

### Permission Denied

- Grant VPN permission when prompted
- Check: Settings > Apps > WireGuard > Permissions

### Battery Drain

- WireGuard is optimized for mobile
- Check: Settings > Battery > App battery usage
- Exclude WireGuard from battery optimization

### Connection Drops

- Enable persistent keepalive (already configured)
- Check cellular/WiFi signal strength
- Try toggling Airplane mode

### Can't Access Resources

- Verify tunnel is active
- Check allowed IPs configuration
- Ensure proper network permissions

## Support

Contact your system administrator for assistance.
