# Keycloak Administration Guide

## VMI03 Security Gateway - Identity Management

### Overview

Keycloak provides centralized authentication and authorization for the ACDev infrastructure. This guide covers setup, configuration, and common administrative tasks.

---

## Access Information

- **URL**: http://154.26.158.31:8080 (via Root tunnel: http://10.100.0.1:8080)
- **Admin Console**: http://154.26.158.31:8080/admin
- **Realm**: `acdev-infrastructure`
- **Admin User**: `alex.campkin`
- **Admin Password**: See `/opt/keycloak/.env`

---

## Initial Setup

### 1. First Login

1. Connect to Root VPN tunnel (10.100.0.0/24)
2. Navigate to admin console
3. Login with alex.campkin credentials
4. You will be prompted to configure TOTP (MFA)

### 2. Configure MFA (TOTP)

1. Install authenticator app (Google Authenticator, Authy, 1Password)
2. Scan QR code presented by Keycloak
3. Enter verification code
4. Save backup codes securely

### 3. Update Admin Password

1. Click your username (top right) → Manage Account
2. Navigate to Account Security → Signing In
3. Update password
4. Use strong, unique password (recommend password manager)

---

## User Management

### Create New User

```bash
# Via Keycloak Admin CLI
docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user alex.campkin \
  --password YOUR_PASSWORD

docker exec keycloak /opt/keycloak/bin/kcadm.sh create users \
  -r acdev-infrastructure \
  -s username=newuser \
  -s email=newuser@acdev.host \
  -s enabled=true \
  -s emailVerified=true
```

Or via Admin UI:

1. Navigate to Users → Add User
2. Fill in required fields
3. Set credentials in Credentials tab
4. Assign roles in Role Mapping tab
5. Add to groups in Groups tab

### Service Accounts

Three service accounts are pre-configured:

1. **dev-admin**: Development administrator
   - Username: `dev-admin`
   - Roles: `infrastructure-admin`
   - Group: `infrastructure-admins`

2. **data-admin**: Database administrator
   - Username: `data-admin`
   - Roles: `database-access`
   - Group: `infrastructure-admins`

3. **sec-admin**: Security administrator
   - Username: `sec-admin`
   - Roles: `infrastructure-admin`
   - Group: `infrastructure-admins`

**Passwords**: See `/opt/keycloak/service-accounts.txt`

**Security**: Change these passwords immediately after deployment!

---

## OAuth2 Client Configuration

### Pre-configured Clients

1. **wireguard-dynamic**: WireGuard dynamic IP management
2. **mcp-services**: MCP agent services
3. **nextcloud**: NextCloud integration (future)
4. **plex**: Plex Media Server (future)

### Add New OAuth2 Client

1. Navigate to Clients → Create
2. Configure:
   - **Client ID**: unique-client-id
   - **Client Protocol**: openid-connect
   - **Access Type**: confidential
   - **Standard Flow**: Enabled
   - **Direct Access Grants**: Enabled
   - **Service Accounts**: Enabled (if needed)
3. Set Valid Redirect URIs
4. Save and note Client Secret

### Example: Integrate New Application

```bash
# Get client secret
docker exec keycloak /opt/keycloak/bin/kcadm.sh get clients \
  -r acdev-infrastructure \
  --fields id,clientId,secret

# Application configuration
KEYCLOAK_URL=http://154.26.158.31:8080
REALM=acdev-infrastructure
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REDIRECT_URI=https://your-app.acdev.host/callback
```

---

## Group and Role Management

### Groups

- **infrastructure-admins**: Full admin access
- **mcp-agents**: MCP service access
- **guests**: Limited guest access

### Roles

- **admin**: Full administrative privileges
- **infrastructure-admin**: Infrastructure management
- **mcp-agent**: MCP service role
- **database-access**: Database access
- **guest**: Guest user role

### Assign User to Group

```bash
docker exec keycloak /opt/keycloak/bin/kcadm.sh update users/USER_ID/groups/GROUP_ID \
  -r acdev-infrastructure \
  -s realm=acdev-infrastructure \
  -s userId=USER_ID \
  -s groupId=GROUP_ID \
  -n
```

Or via Admin UI:

1. Users → Select User → Groups
2. Select group from Available Groups
3. Click Join

---

## SMTP Configuration

Configure email for password reset, verification, etc.

### Using Gmail SMTP

1. Navigate to Realm Settings → Email
2. Configure:
   - **Host**: smtp.gmail.com
   - **Port**: 587
   - **From**: noreply@acdev.host
   - **Enable StartTLS**: Yes
   - **Enable Authentication**: Yes
   - **Username**: your-gmail@gmail.com
   - **Password**: App-specific password

### Using Local Postfix

1. Navigate to Realm Settings → Email
2. Configure:
   - **Host**: localhost
   - **Port**: 25
   - **From**: noreply@acdev.host
   - **Enable StartTLS**: No
   - **Enable Authentication**: No

---

## SSL/TLS Configuration

### Production Setup with Let's Encrypt

```bash
# Install certbot
apt-get install -y certbot

# Stop Keycloak temporarily
cd /opt/keycloak
docker-compose down

# Obtain certificate
certbot certonly --standalone -d auth.acdev.host

# Copy certificates
cp /etc/letsencrypt/live/auth.acdev.host/fullchain.pem /opt/keycloak/certs/
cp /etc/letsencrypt/live/auth.acdev.host/privkey.pem /opt/keycloak/certs/

# Update docker-compose.yml
# Set KC_HTTPS_PORT=8443
# Set KC_HTTPS_CERTIFICATE_FILE=/opt/keycloak/certs/fullchain.pem
# Set KC_HTTPS_CERTIFICATE_KEY_FILE=/opt/keycloak/certs/privkey.pem

# Restart Keycloak
docker-compose up -d

# Set up auto-renewal
cat > /etc/cron.daily/renew-keycloak-cert <<'EOF'
#!/bin/bash
certbot renew --quiet
if [ $? -eq 0 ]; then
    cp /etc/letsencrypt/live/auth.acdev.host/fullchain.pem /opt/keycloak/certs/
    cp /etc/letsencrypt/live/auth.acdev.host/privkey.pem /opt/keycloak/certs/
    docker-compose -f /opt/keycloak/docker-compose.yml restart keycloak
fi
EOF
chmod +x /etc/cron.daily/renew-keycloak-cert
```

---

## Backup and Restore

### Backup Keycloak Database

```bash
# On VMI01 (PostgreSQL server)
su - postgres
pg_dump keycloak > /backups/keycloak-$(date +%Y%m%d).sql
```

### Export Realm Configuration

```bash
docker exec keycloak /opt/keycloak/bin/kc.sh export \
  --dir /opt/keycloak/data/export \
  --realm acdev-infrastructure

# Copy export
docker cp keycloak:/opt/keycloak/data/export /opt/keycloak/backups/
```

### Restore Realm

```bash
# Copy import file
docker cp /opt/keycloak/backups/realm-config.json keycloak:/tmp/

# Import
docker exec keycloak /opt/keycloak/bin/kc.sh import \
  --file /tmp/realm-config.json
```

---

## Monitoring and Logs

### View Logs

```bash
# Docker logs
docker-compose -f /opt/keycloak/docker-compose.yml logs -f keycloak

# Last 100 lines
docker logs keycloak --tail 100

# Follow logs
docker logs -f keycloak
```

### Health Check

```bash
# Check health endpoint
curl http://localhost:8080/health

# Check readiness
curl http://localhost:8080/health/ready

# Check liveness
curl http://localhost:8080/health/live
```

### Metrics

```bash
# Prometheus metrics endpoint
curl http://localhost:8080/metrics
```

---

## Troubleshooting

### Cannot Connect to Database

**Symptom**: Keycloak fails to start, database connection errors

**Solution**:

```bash
# Test PostgreSQL connection from VMI03
nc -zv 46.250.243.123 5432

# Check database credentials
cat /opt/keycloak/.env

# Verify database exists on VMI01
ssh root@46.250.243.123 "su - postgres -c 'psql -l' | grep keycloak"
```

### Port 8080 Not Accessible

**Symptom**: Cannot access Keycloak admin console

**Solution**:

```bash
# Check if container is running
docker ps | grep keycloak

# Check if port is listening
netstat -tlnp | grep 8080

# Check firewall
ufw status | grep 8080

# Allow from Root tunnel
ufw allow from 10.100.0.0/24 to any port 8080
```

### MFA Not Working

**Symptom**: TOTP codes rejected

**Solution**:

- Ensure system time is synchronized (NTP)
- Check time on client device
- Regenerate TOTP secret
- Use backup codes

### Memory Issues

**Symptom**: Keycloak slow or crashing

**Solution**:

```bash
# Check container resources
docker stats keycloak

# Increase memory limit in docker-compose.yml
# memory: 4G  # Increase from 2G

# Restart container
docker-compose restart keycloak
```

---

## Security Best Practices

1. **Enable MFA**: Require TOTP for all admin accounts
2. **Regular Updates**: Keep Keycloak updated
3. **Strong Passwords**: Enforce password policies
4. **Audit Logs**: Enable and review admin events
5. **HTTPS Only**: Use SSL/TLS in production
6. **Network Isolation**: Restrict access via firewall
7. **Backup Regularly**: Automate database backups
8. **Monitor Logs**: Set up alerting for suspicious activity

---

## Additional Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Admin CLI Guide](https://www.keycloak.org/docs/latest/server_admin/#admin-cli)
- [REST API Reference](https://www.keycloak.org/docs-api/latest/rest-api/)
- [OAuth2/OIDC Integration](https://www.keycloak.org/docs/latest/securing_apps/)

---

**Last Updated**: $(date)
**Maintained By**: Alex Campkin
**Support**: acampkinpersonnal@gmail.com
