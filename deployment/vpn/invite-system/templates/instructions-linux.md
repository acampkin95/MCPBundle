# WireGuard VPN Setup - Linux

## Prerequisites

- Modern Linux distribution
- Root/sudo access

## Installation Steps

### 1. Install WireGuard

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install wireguard resolvconf
```

**Fedora/RHEL:**

```bash
sudo dnf install wireguard-tools
```

**Arch Linux:**

```bash
sudo pacman -S wireguard-tools
```

### 2. Install Configuration

```bash
sudo cp mcp-vpn-*.conf /etc/wireguard/wg0.conf
sudo chmod 600 /etc/wireguard/wg0.conf
```

### 3. Start VPN

```bash
sudo wg-quick up wg0
```

### 4. Enable at Boot (Optional)

```bash
sudo systemctl enable wg-quick@wg0
```

### 5. Verify Connection

```bash
sudo wg show
ping 10.10.10.1
```

## Management Commands

**Start VPN:**

```bash
sudo wg-quick up wg0
```

**Stop VPN:**

```bash
sudo wg-quick down wg0
```

**Check Status:**

```bash
sudo wg show
```

**View Logs:**

```bash
sudo journalctl -u wg-quick@wg0
```

## Troubleshooting

### Permission Denied

```bash
sudo chmod 600 /etc/wireguard/wg0.conf
```

### Name Resolution Fails

Ensure resolvconf is installed:

```bash
sudo apt install resolvconf
```

### Can't Load Module

```bash
sudo modprobe wireguard
```

## Support

Contact your system administrator for assistance.
