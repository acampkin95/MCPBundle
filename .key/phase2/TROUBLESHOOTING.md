# VMI03 Security Gateway - Troubleshooting Guide

## Quick Reference

| Component | Service | Port | Log Location |
|-----------|---------|------|--------------|
| WireGuard Root | wg-quick@wg-root | 51820 | journalctl -u wg-quick@wg-root |
| WireGuard MCP | wg-quick@wg-mcp | 51821 | journalctl -u wg-quick@wg-mcp |
| WireGuard Red | wg-quick@wg-red | 51822 | journalctl -u wg-quick@wg-red |
| Keycloak | docker (keycloak) | 8080 | docker logs keycloak |
| PiHole | docker (pihole) | 53, 80 | docker logs pihole |
| Suricata | suricata | - | /var/log/suricata/ |
| Postfix | postfix | 25 | /var/log/mail.log |

---

## WireGuard Issues

### Problem: WireGuard Tunnel Won't Start

**Symptoms**:
```bash
systemctl status wg-quick@wg-root
# Shows: Failed to start
```

**Diagnosis**:
```bash
# Check configuration syntax
wg-quick up wg-root

# Check for errors
journalctl -u wg-quick@wg-root -n 50

# Verify kernel module
lsmod | grep wireguard
modprobe wireguard
```

**Solutions**:
1. **Missing keys**: Ensure all keys are generated
   ```bash
   ls -la /etc/wireguard/keys/root/
   # Should show: server.key, server.pub, client keys
   ```

2. **Port conflict**: Check if port is already in use
   ```bash
   netstat -ulnp | grep 51820
   # Kill conflicting process or change port
   ```

3. **IP forwarding disabled**:
   ```bash
   sysctl net.ipv4.ip_forward
   # Should return: net.ipv4.ip_forward = 1
   sysctl -w net.ipv4.ip_forward=1
   ```

### Problem: Client Can't Connect to WireGuard

**Symptoms**:
- Client shows "Handshake did not complete"
- No traffic flows through tunnel

**Diagnosis**:
```bash
# Check if server is listening
wg show
# Should show interface, listening port, peers

# Check firewall
ufw status | grep 51820
iptables -L -n | grep 51820

# Test connectivity
tcpdump -i eth0 port 51820
```

**Solutions**:
1. **Firewall blocking**:
   ```bash
   ufw allow 51820/udp
   ufw reload
   ```

2. **Incorrect endpoint**: Verify client config
   - Should be: `Endpoint = 154.26.158.31:51820`

3. **Key mismatch**: Regenerate and sync keys
   ```bash
   # On server
   wg show wg-root | grep "peer:"
   # Compare with client public key
   ```

4. **NAT/Router issues**: Check if UDP 51820 is forwarded

### Problem: Split Tunnel Not Working (Root/MCP Tunnels)

**Symptoms**:
- All traffic goes through VPN instead of just admin endpoints
- Internet connectivity lost when connected

**Diagnosis**:
```bash
# On client
ip route
# Should show specific routes for 46.250.243.123, etc.

# Test routing
traceroute 8.8.8.8  # Should NOT go through VPN
traceroute 46.250.243.123  # Should go through VPN
```

**Solutions**:
1. **Client config issue**: Verify `AllowedIPs`
   ```
   # Root tunnel should have:
   AllowedIPs = 10.100.0.0/24, 46.250.243.123/32, 46.250.241.70/32, 154.26.158.31/32
   # NOT: 0.0.0.0/0
   ```

2. **macOS specific**: Add PostUp/PostDown routes
   ```
   PostUp = route add 46.250.243.123/32 %i
   PostDown = route delete 46.250.243.123/32 %i
   ```

### Problem: Red Tunnel Blocking LAN Access (Good!)

**Symptoms**:
- Cannot access local network resources (10.x, 192.168.x)
- This is intended behavior for Red tunnel security

**Verification**:
```bash
# On server, verify blocking rules
iptables -L FORWARD -n -v | grep DROP
# Should show rules blocking private subnets
```

**If you need to allow specific LAN access**:
```bash
# Add exception BEFORE drop rules
iptables -I FORWARD -i wg-red -d 192.168.1.100/32 -j ACCEPT
# Replace with specific IP you need to allow
```

---

## Keycloak Issues

### Problem: Keycloak Container Won't Start

**Symptoms**:
```bash
docker ps | grep keycloak
# Container not running or constantly restarting
```

**Diagnosis**:
```bash
# Check logs
docker logs keycloak --tail 100

# Check container status
docker ps -a | grep keycloak

# Check database connectivity
docker exec keycloak nc -zv 46.250.243.123 5432
```

**Solutions**:
1. **Database connection failed**:
   ```bash
   # On VMI03, test connection
   nc -zv 46.250.243.123 5432

   # Verify credentials in .env
   cat /opt/keycloak/.env

   # Check database exists on VMI01
   ssh root@46.250.243.123 "su - postgres -c 'psql -l | grep keycloak'"
   ```

2. **Port 8080 already in use**:
   ```bash
   netstat -tlnp | grep 8080
   # Kill conflicting process or change port in docker-compose.yml
   ```

3. **Memory issues**:
   ```bash
   # Check available memory
   free -h

   # Increase container memory limit
   # Edit docker-compose.yml:
   # memory: 4G

   docker-compose restart keycloak
   ```

### Problem: Cannot Access Keycloak Admin Console

**Symptoms**:
- Browser can't connect to http://154.26.158.31:8080
- Connection timeout

**Diagnosis**:
```bash
# Check if container is running
docker ps | grep keycloak

# Check if port is listening
netstat -tlnp | grep 8080

# Test from server
curl http://localhost:8080
```

**Solutions**:
1. **Not connected to VPN**: Connect to Root tunnel first
   ```bash
   # Access via: http://10.100.0.1:8080 (VPN gateway)
   # Or: http://154.26.158.31:8080 (public IP)
   ```

2. **Firewall blocking**:
   ```bash
   ufw allow from 10.100.0.0/24 to any port 8080
   ufw reload
   ```

3. **Container not fully started**: Wait 60-90 seconds after start

### Problem: MFA/TOTP Not Working

**Symptoms**:
- TOTP codes always rejected
- "Invalid authenticator code" error

**Solutions**:
1. **Time sync issue**:
   ```bash
   # On VMI03
   timedatectl status
   # Ensure: System clock synchronized: yes

   # Install NTP if needed
   apt-get install -y systemd-timesyncd
   systemctl enable systemd-timesyncd
   systemctl start systemd-timesyncd
   ```

2. **Wrong time on client device**: Check phone/tablet time

3. **Use backup codes**: Access account settings and use backup code

4. **Reset TOTP**:
   ```bash
   # Remove TOTP requirement temporarily
   docker exec keycloak /opt/keycloak/bin/kcadm.sh update users/USER_ID \
     -r acdev-infrastructure \
     -s 'requiredActions=[]'
   ```

---

## PiHole Issues

### Problem: PiHole Container Won't Start

**Symptoms**:
```bash
docker ps | grep pihole
# Container not running
```

**Diagnosis**:
```bash
docker logs pihole --tail 100
docker-compose -f /opt/pihole/docker-compose.yml ps
```

**Solutions**:
1. **Port 53 already in use**:
   ```bash
   # Check what's using port 53
   netstat -ulnp | grep :53

   # If systemd-resolved
   systemctl disable systemd-resolved
   systemctl stop systemd-resolved

   # Edit /etc/systemd/resolved.conf
   # Set: DNSStubListener=no
   ```

2. **Permission issues**:
   ```bash
   chown -R root:root /opt/pihole/etc-pihole
   chmod -R 755 /opt/pihole/etc-pihole
   ```

### Problem: DNS Not Working on Red Tunnel

**Symptoms**:
- Clients can't resolve DNS
- dig/nslookup fails

**Diagnosis**:
```bash
# Test DNS from server
dig @10.102.0.1 example.com

# Check if PiHole is listening
netstat -ulnp | grep :53

# Check iptables rules
iptables -L INPUT -n | grep 53
```

**Solutions**:
1. **PiHole not running**: Start container
   ```bash
   cd /opt/pihole
   docker-compose up -d
   ```

2. **Firewall blocking**:
   ```bash
   iptables -I INPUT -i wg-red -p udp --dport 53 -j ACCEPT
   iptables -I INPUT -i wg-red -p tcp --dport 53 -j ACCEPT
   ```

3. **Client not configured**: Check client DNS settings
   - Should be: `DNS = 10.102.0.1`

### Problem: Cannot Access PiHole Web Interface

**Symptoms**:
- http://10.102.0.1/admin doesn't load
- Connection refused

**Diagnosis**:
```bash
# Check if PiHole web is running
docker exec pihole netstat -tlnp | grep :80

# Test from server
curl http://10.102.0.1/admin
```

**Solutions**:
1. **Connect via Root tunnel**: Web UI only accessible from Root tunnel
   ```bash
   # From Root tunnel (10.100.0.0/24)
   # Access: http://10.102.0.1/admin
   ```

2. **Get password**:
   ```bash
   cat /opt/pihole/.env
   # Or reset password:
   docker exec pihole pihole -a -p newpassword
   ```

---

## Suricata Issues

### Problem: Suricata Not Starting

**Symptoms**:
```bash
systemctl status suricata
# Shows: Failed
```

**Diagnosis**:
```bash
# Test configuration
suricata -T -c /etc/suricata/suricata.yaml -v

# Check logs
journalctl -u suricata -n 50
```

**Solutions**:
1. **Configuration error**: Fix syntax in suricata.yaml

2. **Interface doesn't exist**:
   ```bash
   # Check if wg-red is up
   ip link show wg-red

   # Start WireGuard if needed
   systemctl start wg-quick@wg-red
   ```

3. **Rules not downloaded**:
   ```bash
   suricata-update update-sources
   suricata-update enable-source et/open
   suricata-update
   systemctl restart suricata
   ```

### Problem: No Alerts Being Generated

**Symptoms**:
- /var/log/suricata/fast.log is empty
- No traffic being detected

**Diagnosis**:
```bash
# Check if Suricata is running
systemctl status suricata

# Check interface capture
tcpdump -i wg-red -c 10

# Check Suricata stats
tail /var/log/suricata/stats.log
```

**Solutions**:
1. **No traffic**: Generate test traffic on Red tunnel

2. **Rules not loaded**:
   ```bash
   grep "rules loaded" /var/log/suricata/suricata.log
   # Should show number of rules loaded
   ```

3. **Check rule files**:
   ```bash
   ls -la /var/lib/suricata/rules/
   # Should contain .rules files
   ```

---

## Postfix Issues

### Problem: Mail Not Being Delivered

**Symptoms**:
- Test emails not received
- Mail stuck in queue

**Diagnosis**:
```bash
# Check mail queue
mailq

# Check Postfix status
systemctl status postfix

# Check logs
tail -f /var/log/mail.log
```

**Solutions**:
1. **Postfix not running**:
   ```bash
   systemctl start postfix
   systemctl enable postfix
   ```

2. **DNS issues**: Check hostname resolution
   ```bash
   hostname -f
   # Should return: vmi03.acdev.host

   dig vmi03.acdev.host
   ```

3. **Firewall blocking outgoing SMTP**:
   ```bash
   # Allow outgoing SMTP
   ufw allow out 25/tcp
   ```

4. **Gmail blocking**: Check spam folder or configure SMTP relay

5. **Queue stuck**: Flush queue
   ```bash
   postqueue -f
   # Or view specific message
   postcat -q MESSAGE_ID
   ```

### Problem: Mail Being Marked as Spam

**Symptoms**:
- Emails arrive in spam folder
- SPF/DKIM failures

**Solutions**:
1. **Configure SPF record** (DNS):
   ```
   v=spf1 ip4:154.26.158.31 -all
   ```

2. **Set up reverse DNS** (PTR record):
   - Contact Hetzner to set PTR for 154.26.158.31

3. **Use SMTP relay**:
   ```bash
   # Edit /etc/postfix/main.cf
   relayhost = [smtp.gmail.com]:587
   smtp_sasl_auth_enable = yes
   smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
   smtp_sasl_security_options = noanonymous

   # Create /etc/postfix/sasl_passwd
   [smtp.gmail.com]:587 your-email@gmail.com:app-password

   # Hash and reload
   postmap /etc/postfix/sasl_passwd
   chmod 600 /etc/postfix/sasl_passwd
   systemctl reload postfix
   ```

---

## General System Issues

### Problem: High CPU Usage

**Diagnosis**:
```bash
top
htop
docker stats
```

**Solutions**:
- Identify resource-hungry process
- Restart container if Docker-related
- Check for infinite loops in scripts
- Review Suricata performance settings

### Problem: Out of Disk Space

**Diagnosis**:
```bash
df -h
du -sh /var/log/* | sort -h
du -sh /opt/* | sort -h
docker system df
```

**Solutions**:
```bash
# Clean Docker
docker system prune -a --volumes

# Clean logs
journalctl --vacuum-time=7d
find /var/log -name "*.log" -type f -mtime +7 -delete

# Clean old Suricata logs
find /var/log/suricata -name "*.log" -type f -mtime +7 -delete
```

### Problem: Services Not Starting After Reboot

**Diagnosis**:
```bash
systemctl list-units --failed
journalctl -xb
```

**Solutions**:
```bash
# Enable services
systemctl enable wg-quick@wg-root
systemctl enable wg-quick@wg-mcp
systemctl enable wg-quick@wg-red
systemctl enable docker
systemctl enable suricata
systemctl enable postfix

# Check service dependencies
systemctl list-dependencies wg-quick@wg-root
```

---

## Emergency Recovery

### Complete System Reset (Last Resort)

```bash
# Stop all services
systemctl stop wg-quick@wg-*
systemctl stop suricata
systemctl stop postfix
docker-compose -f /opt/keycloak/docker-compose.yml down
docker-compose -f /opt/pihole/docker-compose.yml down

# Backup important data
tar -czf /root/phase2-backup-$(date +%Y%m%d).tar.gz \
  /etc/wireguard \
  /opt/keycloak \
  /opt/pihole \
  /etc/postfix

# Re-run deployment
cd /opt/phase2
bash deploy-phase2.sh
```

### Restore from Backup

```bash
# Extract backup
tar -xzf /root/phase2-backup-YYYYMMDD.tar.gz -C /

# Restart services
bash /opt/phase2/deploy-phase2.sh
```

---

## Getting Help

1. **Check logs first**: Every service has detailed logs
2. **Review this guide**: Most issues are documented here
3. **Test components individually**: Isolate the problem
4. **Search Keycloak/Suricata/PiHole docs**: Official documentation
5. **Contact support**: acampkinpersonnal@gmail.com

---

## Log Collection for Support

If you need to report an issue, collect these logs:

```bash
#!/bin/bash
# Log collection script
LOGDIR="/root/support-logs-$(date +%Y%m%d-%H%M%S)"
mkdir -p $LOGDIR

# System info
uname -a > $LOGDIR/system-info.txt
df -h > $LOGDIR/disk-usage.txt
free -h > $LOGDIR/memory-usage.txt

# Service status
systemctl status wg-quick@wg-root > $LOGDIR/wg-root-status.txt
systemctl status wg-quick@wg-mcp > $LOGDIR/wg-mcp-status.txt
systemctl status wg-quick@wg-red > $LOGDIR/wg-red-status.txt
systemctl status suricata > $LOGDIR/suricata-status.txt
systemctl status postfix > $LOGDIR/postfix-status.txt
docker ps -a > $LOGDIR/docker-ps.txt

# Logs
journalctl -u wg-quick@wg-root -n 100 > $LOGDIR/wg-root.log
journalctl -u wg-quick@wg-mcp -n 100 > $LOGDIR/wg-mcp.log
journalctl -u wg-quick@wg-red -n 100 > $LOGDIR/wg-red.log
journalctl -u suricata -n 100 > $LOGDIR/suricata.log
docker logs keycloak --tail 100 > $LOGDIR/keycloak.log
docker logs pihole --tail 100 > $LOGDIR/pihole.log
tail -100 /var/log/mail.log > $LOGDIR/postfix.log

# Network
ip addr > $LOGDIR/ip-addr.txt
ip route > $LOGDIR/ip-route.txt
iptables -L -n -v > $LOGDIR/iptables.txt
wg show > $LOGDIR/wg-show.txt

# Compress
tar -czf $LOGDIR.tar.gz $LOGDIR
echo "Logs collected: $LOGDIR.tar.gz"
```

---

**Last Updated**: 2025-01-06
**Maintained By**: Alex Campkin
