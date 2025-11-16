# Wazuh Manager WAN Configuration

## Overview

Wazuh Manager has been configured on VMI03 (154.26.158.31) to be accessible over WAN through the Jump Box (154.26.158.68) NAT port forwarding. This enables remote agents to connect securely using TLS encryption.

## Infrastructure Details

```
Internet → Jump Box (154.26.158.68) → VMI03 (10.0.0.3/154.26.158.31)
                ↓ NAT Forwarding ↓           ↓ Wazuh Manager ↓
           Ports: 1514, 1515, 55000     Running on Internal Network
```

## Configuration Summary

### Wazuh Manager Installation

- **Version**: 4.14.0-1
- **Location**: VMI03 (10.0.0.3 / 154.26.158.31)
- **Installation Path**: /var/ossec
- **Configuration**: /var/ossec/etc/ossec.conf

### TLS Certificates

- **Server Certificate**: /var/ossec/etc/sslmanager.cert/server.cert
- **Server Key**: /var/ossec/etc/sslmanager.key/server.key
- **Auth Certificate**: /var/ossec/etc/authd.cert
- **Auth Key**: /var/ossec/etc/authd.key
- **Validity**: 365 days from November 9, 2025

### Network Configuration

#### Ports

- **1514/TCP**: Agent communication (TLS encrypted)
- **1515/TCP**: Agent enrollment (TLS encrypted)
- **55000/TCP**: Wazuh API (HTTPS)

#### NAT Port Forwarding (Jump Box)

```bash
# Agent communication
iptables -t nat -A PREROUTING -p tcp --dport 1514 -j DNAT --to-destination 10.0.0.3:1514
# Agent enrollment
iptables -t nat -A PREROUTING -p tcp --dport 1515 -j DNAT --to-destination 10.0.0.3:1515
# API access
iptables -t nat -A PREROUTING -p tcp --dport 55000 -j DNAT --to-destination 10.0.0.3:55000
```

#### Firewall Rules (VMI03)

```bash
# Allow Wazuh ports
iptables -I INPUT -p tcp --dport 1514 -j ACCEPT -m comment --comment "Wazuh agent communication"
iptables -I INPUT -p tcp --dport 1515 -j ACCEPT -m comment --comment "Wazuh agent enrollment"
iptables -I INPUT -p tcp --dport 55000 -j ACCEPT -m comment --comment "Wazuh API"
iptables -I INPUT -p udp --dport 1514 -j ACCEPT -m comment --comment "Wazuh Syslog UDP"
```

## Agent Configuration

### For WAN Agents

Agents connecting from outside the network should use the Jump Box public IP:

```xml
<ossec_config>
  <client>
    <server>
      <address>154.26.158.68</address>
      <port>1514</port>
      <protocol>tcp</protocol>
    </server>
  </client>
</ossec_config>
```

### Agent Registration

#### Method 1: Using Registration Service

```bash
# On the agent machine
/var/ossec/bin/agent-auth -m 154.26.158.68 -p 1515
```

#### Method 2: Manual Registration

1. On the manager, add agent:

```bash
ssh root@154.26.158.68
ssh root@10.0.0.3
/var/ossec/bin/manage_agents
```

2. Copy the key to the agent and import it:

```bash
/var/ossec/bin/manage_agents -i [KEY]
```

### TLS Configuration for Agents

Agents will automatically use TLS when connecting to port 1514/TCP. Ensure agents have:

- Valid system time (for certificate validation)
- TCP connectivity to 154.26.158.68:1514

## Service Management

### Check Service Status

```bash
# From jump box
ssh root@10.0.0.3 '/var/ossec/bin/wazuh-control status'

# Check specific services
ssh root@10.0.0.3 'systemctl status wazuh-manager'
```

### Start/Stop Services

```bash
# Start all services
ssh root@10.0.0.3 '/var/ossec/bin/wazuh-control start'

# Stop all services
ssh root@10.0.0.3 '/var/ossec/bin/wazuh-control stop'

# Restart services
ssh root@10.0.0.3 '/var/ossec/bin/wazuh-control restart'
```

### Manual Service Start (if needed)

```bash
# Start individual services in debug mode
/var/ossec/bin/wazuh-authd -d &
/var/ossec/bin/wazuh-remoted -d &
/var/ossec/bin/wazuh-analysisd -d &
/var/ossec/bin/wazuh-db -d &
```

## API Access

### WAN Access

The Wazuh API is accessible at:

- **URL**: https://154.26.158.68:55000
- **Authentication**: Required (check /var/ossec/api/configuration/api.yaml)

### API Configuration

```yaml
# /var/ossec/api/configuration/api.yaml
host: 0.0.0.0
port: 55000
https:
  enabled: true
  key: '/var/ossec/api/configuration/ssl/server.key'
  cert: '/var/ossec/api/configuration/ssl/server.crt'
```

## Testing Connectivity

### From External Network

```bash
# Test agent communication port
nc -zv 154.26.158.68 1514

# Test enrollment port
nc -zv 154.26.158.68 1515

# Test API port
nc -zv 154.26.158.68 55000

# Test with telnet
telnet 154.26.158.68 1514
```

### From Internal Network

```bash
# Direct to VMI03
nc -zv 10.0.0.3 1514
nc -zv 10.0.0.3 1515
nc -zv 10.0.0.3 55000
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
tail -f /var/ossec/logs/ossec.log

# Check for port conflicts
netstat -tlnp | grep -E "1514|1515|55000"

# Verify certificates
ls -la /var/ossec/etc/*.cert
ls -la /var/ossec/etc/*.key
```

### Agent Can't Connect

1. Verify firewall rules on both jump box and VMI03
2. Check NAT forwarding rules
3. Verify TLS certificates are valid
4. Check agent logs: /var/ossec/logs/ossec.log

### Common Issues

#### Issue: wazuh-authd not starting

**Solution**: Manually start with debug flag to see errors

```bash
/var/ossec/bin/wazuh-authd -dd
```

#### Issue: Port 1515 not listening

**Solution**: authd may need explicit configuration in ossec.conf

```xml
<ossec_config>
  <auth>
    <port>1515</port>
    <use_ssl>yes</use_ssl>
    <ssl_cert>/var/ossec/etc/authd.cert</ssl_cert>
    <ssl_key>/var/ossec/etc/authd.key</ssl_key>
  </auth>
</ossec_config>
```

#### Issue: Connection refused from WAN

**Solution**: Verify NAT rules are active

```bash
# On jump box
iptables -t nat -L PREROUTING -n -v
```

## Security Notes

1. **TLS Encryption**: All agent communications are encrypted using TLS
2. **Firewall Protection**: Only required ports are exposed
3. **NAT Security**: Internal network remains protected behind NAT
4. **Certificate Management**: Rotate certificates annually
5. **Access Control**: Consider implementing IP whitelisting for additional security

## Log Locations

- **Main Log**: /var/ossec/logs/ossec.log
- **API Log**: /var/ossec/logs/api.log
- **Alert Log**: /var/ossec/logs/alerts/alerts.log
- **Archive Log**: /var/ossec/logs/archives/

## Monitoring

### Check Active Agents

```bash
/var/ossec/bin/agent_control -l
```

### View Recent Alerts

```bash
tail -f /var/ossec/logs/alerts/alerts.log
```

### API Health Check

```bash
curl -k https://154.26.158.68:55000/health
```

## Maintenance

### Certificate Renewal (Annual)

```bash
# Generate new certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /var/ossec/etc/sslmanager.key/server.key \
  -out /var/ossec/etc/sslmanager.cert/server.cert \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=wazuh-manager"

# Restart services
/var/ossec/bin/wazuh-control restart
```

### Backup Configuration

```bash
# Backup Wazuh configuration
tar -czf wazuh-backup-$(date +%Y%m%d).tar.gz /var/ossec/etc/
```

---

**Setup Date**: November 9, 2025
**Version**: Wazuh 4.14.0
**Configuration Type**: WAN-accessible with TLS
**Access Point**: 154.26.158.68 (Jump Box NAT)
