# WireGuard VPN Setup - iOS

## Prerequisites

- iOS 12 or later
- WireGuard app from App Store

## Installation Steps

### Method 1: QR Code (Recommended)

1. Install WireGuard from App Store
2. Open WireGuard app
3. Tap "+" button
4. Select "Create from QR code"
5. Scan the QR code displayed on the website
6. Name your tunnel (e.g., "MCP VPN")
7. Tap "Save"
8. Toggle switch to connect

### Method 2: Mobile Configuration Profile

1. Download the `.mobileconfig` file
2. Open in Files app
3. Tap the file
4. iOS will prompt to install profile
5. Go to Settings > General > VPN & Device Management
6. Install the profile
7. Open WireGuard app
8. Toggle switch to connect

## Usage

### Connect to VPN

1. Open WireGuard app
2. Toggle the switch for "MCP VPN"
3. Status shows "Active" when connected

### Disconnect

1. Open WireGuard app
2. Toggle off the switch

## Troubleshooting

### Profile Won't Install

- Ensure you're downloading from a trusted source
- Check iOS version compatibility
- Try restarting device

### Connection Fails

- Check cellular/WiFi connection
- Verify tunnel is toggled on
- Try deleting and re-scanning QR code

### VPN Doesn't Stay Connected

- Enable "On Demand" in tunnel settings
- Check battery optimization settings
- Verify persistent keepalive is enabled

## Support

Contact your system administrator for assistance.
