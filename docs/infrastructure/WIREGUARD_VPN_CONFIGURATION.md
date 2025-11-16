# WireGuard VPN Configuration - Jump Box Admin Access

## Server Details

**Jump Box Server**: 154.26.158.68
**WireGuard Port**: 51821
**VPN Network**: 10.10.10.0/24
**DNS Server**: 10.10.10.1 (AdGuard Home)

## Features Configured

1. **Full Tunnel VPN** - All traffic routes through the VPN (no split tunnel)
2. **AdGuard Home DNS** - Ad blocking and privacy protection
3. **Internet Access** - Full internet connectivity through the jump box
4. **Internal Network Access** - Access to 10.0.0.0/22 internal network
5. **IP Forwarding** - Enabled between eth0 (public) and eth1 (internal)

## Client Configurations

### Admin Client

Save this configuration as `wg0.conf` on your client device:

```ini
[Interface]
PrivateKey = OKnDm83CCVs9whofjU8iLbDPnCufi5L+0Z73H8MgRlQ=
Address = 10.10.10.2/24
DNS = 10.10.10.1

[Peer]
PublicKey = SDzshxmtcYD6Y2dY6Yqbz+9Ba6qeskhOIn5uSICEezo=
Endpoint = 154.26.158.68:51821
AllowedIPs = 0.0.0.0/0, ::/0, 10.0.0.0/22, 10.10.10.0/24
PersistentKeepalive = 25
```

### ACDev Access

Alternative client configuration for ACDev team:

```ini
[Interface]
PrivateKey = iIg18PVlUCtCSC2ox7m8+DVG9nMgq8A9inFnT/iPino=
Address = 10.10.10.3/24
DNS = 10.10.10.1

[Peer]
PublicKey = SDzshxmtcYD6Y2dY6Yqbz+9Ba6qeskhOIn5uSICEezo=
Endpoint = 154.26.158.68:51821
AllowedIPs = 0.0.0.0/0, ::/0, 10.0.0.0/22, 10.10.10.0/24
PersistentKeepalive = 25
```

## Installation Instructions

### macOS

1. Install WireGuard from App Store or `brew install wireguard-tools`
2. Save the configuration above as `wg0.conf`
3. Import to WireGuard app or use command line:

   ```bash
   sudo wg-quick up ./wg0.conf
   ```

### Windows

1. Download WireGuard from [wireguard.com](https://www.wireguard.com/install/)
2. Import the configuration file
3. Click "Activate"

### Linux

1. Install WireGuard: `sudo apt install wireguard`
2. Save configuration to `/etc/wireguard/wg0.conf`
3. Start VPN: `sudo wg-quick up wg0`
4. Enable auto-start: `sudo systemctl enable wg-quick@wg0`

### iOS/Android

1. Install WireGuard app from App Store/Play Store
2. Scan QR code or import configuration file
3. Toggle connection on

## Access to Internal Nodes

Once connected to the VPN, you can access:

- **10.0.0.1** - Internal Node 1
- **10.0.0.2** - Internal Node 2
- **10.0.0.3** - Internal Node 3
- **10.0.0.4** - Jump Box Internal Interface

SSH to internal nodes (export `MCP_ROOT_PASSWORD` via `npm run secrets:pull` and use it when prompted):

```bash
ssh root@10.0.0.1  # Password: $MCP_ROOT_PASSWORD (Contabo Secrets)
ssh root@10.0.0.2  # Password: $MCP_ROOT_PASSWORD (Contabo Secrets)
ssh root@10.0.0.3  # Password: $MCP_ROOT_PASSWORD (Contabo Secrets)
```

## AdGuard Home DNS

### Public DNS Server

AdGuard Home DNS is now **publicly accessible** at: `154.26.158.68`

You can use this DNS server even without VPN connection:

- Primary DNS: `154.26.158.68`
- Features: Ad blocking, malware protection, privacy filtering
- Rate limited: 30 queries/second per IP

### Web Interface

Access the AdGuard Home dashboard at: `http://10.10.10.1:3000` (VPN required)

**Login Credentials**:

- Username: admin
- Password: admin (change this on first login!)

## Services Running

- **WireGuard VPN**: Port 51821 (UDP)
- **AdGuard Home DNS**: Port 53 (TCP/UDP)
- **AdGuard Home Web**: Port 3000 (HTTP)

## Firewall Rules Applied

- MAC address whitelisted: 6e:d9:d3:17:f6:48
- Full NAT/Masquerading for VPN clients
- Forwarding enabled between eth0 and eth1
- DNS queries routed through AdGuard Home

## Troubleshooting

### Check VPN Status

```bash
# On server
sudo wg show

# On client
sudo wg show
ping 10.10.10.1
```

### Internal Network Connectivity

If you cannot ping internal nodes (10.0.0.1-3) after connecting:

1. **Disconnect and reconnect** your VPN client with the updated configuration
2. **Verify routing** on your client:
   ```bash
   # Check if routes are added
   ip route | grep 10.0.0
   # or on macOS
   netstat -rn | grep 10.0.0
   ```
3. **Test connectivity step by step**:

   ```bash
   # Test VPN gateway
   ping 10.10.10.1

   # Test internal nodes
   ping 10.0.0.1
   ping 10.0.0.2
   ping 10.0.0.3
   ```

### DNS Resolution Test

```bash
nslookup google.com 10.10.10.1
dig @10.10.10.1 google.com
```

### View AdGuard Logs

```bash
ssh root@154.26.158.68
journalctl -u AdGuardHome -f
```

### Restart Services

```bash
# On jump box
systemctl restart wg-quick@wg0
systemctl restart AdGuardHome
```

## Security Notes

1. **Change AdGuard password** immediately after first login
2. The private key in client config should be kept secure
3. Consider rotating keys periodically
4. Monitor access logs regularly

## Additional Client Configurations

To add more VPN clients, generate new keys on the server:

```bash
ssh root@154.26.158.68
cd /etc/wireguard
wg genkey | tee client2.key | wg pubkey > client2.pub
# Add peer to wg0.conf with new IP (10.10.10.4, etc.)
wg syncconf wg0 <(wg-quick strip wg0)
```

## Direct SSH Access (Without VPN)

Your IP (58.105.139.107) is whitelisted for direct SSH access:

```bash
# Direct access to nodes (enter $MCP_ROOT_PASSWORD from Contabo Secrets when prompted)
ssh root@46.250.243.123  # VMI01
ssh root@46.250.241.70   # VMI02D
ssh root@154.26.158.31   # VMI03
ssh root@154.26.158.68   # Jump Box

# Or via jump box proxy with the same credential
ssh -J root@154.26.158.68 root@10.0.0.1  # VMI01
ssh -J root@154.26.158.68 root@10.0.0.2  # VMI02D
ssh -J root@154.26.158.68 root@10.0.0.3  # VMI03
```

---

**Setup Completed**: 2025-11-09
**Configuration Version**: 1.1
