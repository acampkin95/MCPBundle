# WireGuard Client Setup Guide

## Quick Start

### Available Client Configurations

Located in `/Users/alex/Projects/MCP Bundle/deployment/wireguard/configs/`:

1. **client-root.conf** - Full administrative access
2. **client-mcp.conf** - Service mesh access
3. **client-red.conf** - Restricted access

## Installation Instructions

### macOS

1. **Install WireGuard**:

   ```bash
   brew install wireguard-tools
   ```

2. **Copy configuration**:

   ```bash
   sudo cp client-root.conf /usr/local/etc/wireguard/
   ```

3. **Connect**:

   ```bash
   sudo wg-quick up client-root
   ```

4. **Disconnect**:
   ```bash
   sudo wg-quick down client-root
   ```

### Linux

1. **Install WireGuard**:

   ```bash
   sudo apt install wireguard
   ```

2. **Copy configuration**:

   ```bash
   sudo cp client-root.conf /etc/wireguard/
   ```

3. **Connect**:

   ```bash
   sudo wg-quick up client-root
   ```

4. **Disconnect**:
   ```bash
   sudo wg-quick down client-root
   ```

### Windows

1. Download WireGuard from https://www.wireguard.com/install/
2. Import the configuration file through the GUI
3. Click "Activate" to connect

## Network Access by Tunnel

### ROOT Tunnel (client-root.conf)

**Purpose**: Full administrative access
**Network**: 10.0.50.0/24

| Server | VPN IP      | Access Level |
| ------ | ----------- | ------------ |
| VMI01  | 10.0.50.1   | Full Admin   |
| VMI02D | 10.0.50.2   | Full Admin   |
| VMI03  | 10.0.50.3   | Full Admin   |
| Client | 10.0.50.254 | Full Admin   |

### MCP Tunnel (client-mcp.conf)

**Purpose**: Service mesh communication
**Network**: 10.0.51.0/24

| Server | VPN IP      | Access Level |
| ------ | ----------- | ------------ |
| VMI01  | 10.0.51.1   | Service Mesh |
| VMI02D | 10.0.51.2   | Service Mesh |
| VMI03  | 10.0.51.3   | Service Mesh |
| Client | 10.0.51.254 | Service Mesh |

### RED Tunnel (client-red.conf)

**Purpose**: Restricted network access
**Network**: 10.0.52.0/24

| Server | VPN IP      | Access Level |
| ------ | ----------- | ------------ |
| VMI01  | 10.0.52.1   | Restricted   |
| VMI02D | 10.0.52.2   | Restricted   |
| VMI03  | 10.0.52.3   | Restricted   |
| Client | 10.0.52.254 | Restricted   |

## Testing Your Connection

After connecting, test connectivity:

```bash
# Test ROOT tunnel
ping 10.0.50.1  # VMI01
ping 10.0.50.2  # VMI02D
ping 10.0.50.3  # VMI03

# Test MCP tunnel
ping 10.0.51.1  # VMI01
ping 10.0.51.2  # VMI02D
ping 10.0.51.3  # VMI03

# Test RED tunnel
ping 10.0.52.1  # VMI01
ping 10.0.52.2  # VMI02D
ping 10.0.52.3  # VMI03
```

## SSH Access Through VPN

Once connected to a VPN tunnel, you can SSH directly using VPN IPs:

```bash
# Through ROOT tunnel
ssh root@10.0.50.1  # VMI01
ssh root@10.0.50.2  # VMI02D
ssh root@10.0.50.3  # VMI03

# Password for all: Use Contabo secret `mcp-root-password` (export as `MCP_ROOT_PASSWORD`)
```

## Troubleshooting

### Cannot Connect

1. Check if WireGuard is installed: `wg --version`
2. Verify configuration file exists
3. Run with sudo/admin privileges
4. Check if ports are blocked by local firewall

### No Response from Servers

1. Verify you're using the correct tunnel
2. Check VPN interface is up: `wg show`
3. Try pinging the gateway first
4. Verify DNS is working: `nslookup google.com`

### Slow Performance

1. Check MTU settings (default: 1420)
2. Verify network latency: `ping -c 10 <vpn-ip>`
3. Check for packet loss
4. Consider using a different tunnel

### Connection Drops

1. Check persistent keepalive is set (25 seconds)
2. Verify your internet connection is stable
3. Check if fail2ban has blocked your IP
4. Review WireGuard logs

## Security Best Practices

1. **Protect Configuration Files**:
   - Keep config files secure
   - Don't share private keys
   - Use appropriate file permissions (600)

2. **Use Appropriate Tunnel**:
   - ROOT: Only for infrastructure management
   - MCP: For service deployment
   - RED: For restricted operations

3. **Monitor Your Connection**:

   ```bash
   # Check connection status
   sudo wg show

   # View transfer statistics
   sudo wg show client-root transfer
   ```

4. **Disconnect When Not in Use**:
   ```bash
   sudo wg-quick down client-root
   ```

## Advanced Usage

### Auto-start on Boot (Linux)

```bash
sudo systemctl enable wg-quick@client-root
sudo systemctl start wg-quick@client-root
```

### Multiple Tunnels Simultaneously

You can run multiple tunnels at once:

```bash
sudo wg-quick up client-root
sudo wg-quick up client-mcp
# Both tunnels now active
```

### Check Handshake Status

```bash
sudo wg show client-root latest-handshakes
```

## Support Information

- **Configuration Files**: `/Users/alex/Projects/MCP Bundle/deployment/wireguard/configs/`
- **Documentation**: `WIREGUARD_VPN_DOCUMENTATION.md`
- **Security Audit**: `WIREGUARD_SECURITY_AUDIT.md`

## Quick Reference Card

```bash
# Connect to ROOT tunnel (full admin)
sudo wg-quick up client-root

# SSH to servers through VPN
ssh root@10.0.50.1  # VMI01
ssh root@10.0.50.2  # VMI02D
ssh root@10.0.50.3  # VMI03

# Check status
sudo wg show

# Disconnect
sudo wg-quick down client-root
```

---

**Last Updated**: November 7, 2025
**Version**: 1.0
**Status**: OPERATIONAL
