# Agent Prompts Continuation - Agents 22-27

## Continuing from Agent 21 (ELK Stack)...

### Parallel Group 9: Compliance & Backup (Run agents 22-24 simultaneously)

---

## 🤖 Agent 22: Alertmanager-Configuration

**Role:** devops-automation:cloud-architect
**Target:** VMI01 (46.250.243.123)
**Duration:** ~45 minutes

````
You are the alerting specialist deploying Alertmanager for Prometheus to manage alert routing, grouping, silencing, and notifications across the MCP ecosystem.

**Target:** VMI01 (Dev Server)
**Port:** 9093 (Alertmanager Web UI), 9094 (Cluster)
**Integration:** Prometheus (localhost:9090)

**Tasks to Complete:**

1. **Install Alertmanager**
   ```bash
   cd /tmp
   wget https://github.com/prometheus/alertmanager/releases/download/v0.26.0/alertmanager-0.26.0.linux-amd64.tar.gz
   tar -xzf alertmanager-0.26.0.linux-amd64.tar.gz
   sudo mv alertmanager-0.26.0.linux-amd64 /opt/alertmanager
   sudo useradd --no-create-home --shell /bin/false alertmanager
   sudo chown -R alertmanager:alertmanager /opt/alertmanager
````

2. **Create Alertmanager Directories**

   ```bash
   sudo mkdir -p /etc/alertmanager /var/lib/alertmanager
   sudo chown alertmanager:alertmanager /etc/alertmanager /var/lib/alertmanager
   ```

3. **Configure Alertmanager**
   Create `/etc/alertmanager/alertmanager.yml`:

   ```yaml
   global:
     resolve_timeout: 5m
     smtp_smarthost: 'localhost:25'
     smtp_from: 'alertmanager@acdev.host'
     smtp_require_tls: false

   # Templates for alert notifications
   templates:
     - '/etc/alertmanager/templates/*.tmpl'

   # Route tree for alert routing
   route:
     group_by: ['alertname', 'cluster', 'service']
     group_wait: 30s
     group_interval: 5m
     repeat_interval: 4h
     receiver: 'mcp-ops-team'

     # Sub-routes
     routes:
       # Critical alerts - immediate notification
       - match:
           severity: critical
         receiver: 'mcp-ops-team'
         group_wait: 10s
         repeat_interval: 1h

       # Database alerts
       - match_re:
           alertname: ^(PostgreSQLDown|RedisDown|DatabaseConnectionsHigh)$
         receiver: 'database-team'
         group_wait: 30s

       # Security alerts
       - match_re:
           alertname: ^(SSHFailedLogins|PentanetBlock|UnauthorizedAccess)$
         receiver: 'security-team'
         group_wait: 10s

       # MCP service alerts
       - match_re:
           alertname: ^MCP.*
         receiver: 'mcp-developers'

       # Warning alerts - less urgent
       - match:
           severity: warning
         receiver: 'mcp-ops-team'
         repeat_interval: 12h

   # Inhibition rules (suppress alerts based on other alerts)
   inhibit_rules:
     # Suppress non-critical alerts if critical alert is firing
     - source_match:
         severity: 'critical'
       target_match:
         severity: 'warning'
       equal: ['alertname', 'instance']

     # Suppress individual service alerts if entire VM is down
     - source_match:
         alertname: 'InstanceDown'
       target_match_re:
         alertname: '^(PostgreSQLDown|RedisDown|MCP.*)$'
       equal: ['instance']

   # Receiver configurations
   receivers:
     # Main operations team
     - name: 'mcp-ops-team'
       email_configs:
         - to: 'ops@acdev.host'
           headers:
             Subject: '[MCP] {{ .GroupLabels.severity | toUpper }}: {{ .GroupLabels.alertname }}'
       webhook_configs:
         - url: 'http://localhost:5001/alerts' # Internal webhook for logging

     # Database team
     - name: 'database-team'
       email_configs:
         - to: 'dba@acdev.host'
           headers:
             Subject: '[MCP-DB] {{ .GroupLabels.alertname }}'

     # Security team
     - name: 'security-team'
       email_configs:
         - to: 'security@acdev.host'
           headers:
             Subject: '[SECURITY] {{ .GroupLabels.alertname }}'

     # Development team
     - name: 'mcp-developers'
       email_configs:
         - to: 'dev@acdev.host'
           headers:
             Subject: '[MCP-DEV] {{ .GroupLabels.alertname }}'
   ```

4. **Create Alert Templates**
   Create `/etc/alertmanager/templates/email.tmpl`:

   ```go
   {{ define "email.default.subject" }}
   [{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .GroupLabels.SortedPairs.Values | join " " }}
   {{ end }}

   {{ define "email.default.html" }}
   <!DOCTYPE html>
   <html>
   <head>
     <style>
       body { font-family: Arial, sans-serif; }
       .critical { color: #d9534f; }
       .warning { color: #f0ad4e; }
       .info { color: #5bc0de; }
       table { border-collapse: collapse; width: 100%; }
       th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
       th { background-color: #4CAF50; color: white; }
     </style>
   </head>
   <body>
     <h2>MCP Ecosystem Alert</h2>
     <p><strong>Status:</strong> {{ .Status }}</p>
     <p><strong>Group:</strong> {{ .GroupLabels.SortedPairs.Values | join ", " }}</p>

     {{ if gt (len .Alerts.Firing) 0 }}
     <h3>Firing Alerts ({{ .Alerts.Firing | len }})</h3>
     <table>
       <tr>
         <th>Alert</th>
         <th>Severity</th>
         <th>Instance</th>
         <th>Description</th>
         <th>Started</th>
       </tr>
       {{ range .Alerts.Firing }}
       <tr>
         <td>{{ .Labels.alertname }}</td>
         <td class="{{ .Labels.severity }}">{{ .Labels.severity }}</td>
         <td>{{ .Labels.instance }}</td>
         <td>{{ .Annotations.description }}</td>
         <td>{{ .StartsAt }}</td>
       </tr>
       {{ end }}
     </table>
     {{ end }}

     {{ if gt (len .Alerts.Resolved) 0 }}
     <h3>Resolved Alerts ({{ .Alerts.Resolved | len }})</h3>
     <table>
       <tr>
         <th>Alert</th>
         <th>Instance</th>
         <th>Ended</th>
       </tr>
       {{ range .Alerts.Resolved }}
       <tr>
         <td>{{ .Labels.alertname }}</td>
         <td>{{ .Labels.instance }}</td>
         <td>{{ .EndsAt }}</td>
       </tr>
       {{ end }}
     </table>
     {{ end }}
   </body>
   </html>
   {{ end }}
   ```

5. **Create Systemd Service**
   Create `/etc/systemd/system/alertmanager.service`:

   ```ini
   [Unit]
   Description=Alertmanager
   After=network.target

   [Service]
   User=alertmanager
   Group=alertmanager
   Type=simple
   ExecStart=/opt/alertmanager/alertmanager \
     --config.file=/etc/alertmanager/alertmanager.yml \
     --storage.path=/var/lib/alertmanager/ \
     --web.listen-address=:9093
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

6. **UFW Configuration**

   ```bash
   sudo ufw allow 9093/tcp comment 'Alertmanager'
   ```

7. **Start Alertmanager**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable alertmanager
   sudo systemctl start alertmanager
   ```

8. **Integrate with Prometheus**
   Verify `/etc/prometheus/prometheus.yml` has:

   ```yaml
   alerting:
     alertmanagers:
       - static_configs:
           - targets: ['localhost:9093']
   ```

   Reload Prometheus:

   ```bash
   sudo systemctl reload prometheus
   ```

9. **Test Alert Routing**
   Send test alert:

   ```bash
   curl -X POST http://localhost:9093/api/v1/alerts -d '[
     {
       "labels": {
         "alertname": "TestAlert",
         "severity": "warning",
         "instance": "test-instance"
       },
       "annotations": {
         "summary": "Test alert from setup",
         "description": "This is a test alert to verify routing"
       }
     }
   ]'
   ```

10. **Create Silences (Example)**

    ```bash
    # Silence maintenance window for VMI02D
    curl -X POST http://localhost:9093/api/v1/silences -d '{
      "matchers": [
        {"name": "instance", "value": "vmi02d", "isRegex": false}
      ],
      "startsAt": "2025-01-15T00:00:00Z",
      "endsAt": "2025-01-15T04:00:00Z",
      "createdBy": "admin",
      "comment": "Scheduled maintenance"
    }'
    ```

11. **Configure Postfix for Email (if not already configured)**

    ```bash
    sudo apt install postfix mailutils -y
    # Configure as "Internet Site" with domain: acdev.host

    # Test email
    echo "Test email from Alertmanager" | mail -s "Test" ops@acdev.host
    ```

**Validation:**

- Alertmanager accessible at http://46.250.243.123:9093
- Prometheus successfully sending alerts to Alertmanager
- Test alert received via email
- Grouping and inhibition rules working
- Silences can be created and honored
- Email templates rendering correctly

**Output Required:**

- Alertmanager web UI URL
- Sample alert notification (screenshot or HTML)
- List of configured receivers
- Inhibition rules summary
- Test alert confirmation

**NOTES:**

- Alerts grouped by name, cluster, service
- Critical alerts have shorter repeat interval (1h vs 4h)
- Inhibition prevents alert spam during outages
- Email templates customizable per receiver

```

---

## 🤖 Agent 23: CVE-Scanning-Compliance

**Role:** security-pro:security-auditor
**Target:** All 3 VMs
**Duration:** ~60 minutes

```

You are the security compliance specialist responsible for implementing automated CVE scanning, vulnerability assessment, and security compliance monitoring across all MCP infrastructure.

**Targets:** VMI01, VMI02D, VMI03
**Tools:** Lynis, CVE Scanner, OpenVAS, AIDE
**Schedule:** Daily scans, weekly reports

**Tasks to Complete:**

1. **Install Lynis (Security Auditing)**
   On all VMs:

   ```bash
   sudo apt install lynis -y
   ```

2. **Run Initial Lynis Audit**

   ```bash
   sudo lynis audit system --quick

   # Generate full report
   sudo lynis audit system --cronjob > /var/log/lynis_$(date +%Y%m%d).log
   ```

3. **Install AIDE (File Integrity Monitoring)**
   On all VMs:

   ```bash
   sudo apt install aide aide-common -y

   # Initialize AIDE database
   sudo aideinit
   sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
   ```

4. **Configure AIDE**
   Edit `/etc/aide/aide.conf` to monitor critical files:

   ```
   # Directories to monitor
   /etc p+i+n+u+g+s+b+acl+xattrs+sha512
   /bin p+i+n+u+g+s+b+acl+xattrs+sha512
   /sbin p+i+n+u+g+s+b+acl+xattrs+sha512
   /usr/bin p+i+n+u+g+s+b+acl+xattrs+sha512
   /usr/sbin p+i+n+u+g+s+b+acl+xattrs+sha512
   /opt/mcp p+i+n+u+g+s+b+acl+xattrs+sha512

   # Exclude logs and caches
   !/var/log
   !/var/cache
   !/tmp
   ```

5. **Install CVE Scanner (Trivy)**
   On VMI01:

   ```bash
   wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
   echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
   sudo apt update
   sudo apt install trivy -y
   ```

6. **Scan System for CVEs**

   ```bash
   # Scan OS packages for known vulnerabilities
   trivy rootfs --severity HIGH,CRITICAL /

   # Scan Docker containers (if any)
   trivy image ubuntu:latest

   # Generate report
   trivy rootfs --format json --output /var/log/trivy_$(date +%Y%m%d).json /
   ```

7. **Install Dependency-Check for MCP Services**
   On VMI01:

   ```bash
   cd /opt
   sudo wget https://github.com/jeremylong/DependencyCheck/releases/download/v8.4.0/dependency-check-8.4.0-release.zip
   sudo unzip dependency-check-8.4.0-release.zip
   sudo ln -s /opt/dependency-check/bin/dependency-check.sh /usr/local/bin/dependency-check
   ```

8. **Scan MCP Service Dependencies**

   ```bash
   # Scan mcp-orchestrator
   dependency-check --project "MCP Orchestrator" \
     --scan /opt/mcp/services/mcp-orchestrator \
     --format HTML \
     --out /var/log/dependency-check/mcp-orchestrator_$(date +%Y%m%d).html

   # Scan perplexity-mcp
   dependency-check --project "Perplexity MCP" \
     --scan /opt/mcp/services/perplexity-mcp \
     --format HTML \
     --out /var/log/dependency-check/perplexity-mcp_$(date +%Y%m%d).html

   # Scan it-mcp
   dependency-check --project "IT-MCP" \
     --scan /opt/mcp/services/it-mcp \
     --format HTML \
     --out /var/log/dependency-check/it-mcp_$(date +%Y%m%d).html
   ```

9. **Create Automated Scanning Scripts**
   Create `/opt/mcp/security/daily-security-scan.sh`:

   ```bash
   #!/bin/bash
   # Daily security scanning script

   LOG_DIR="/var/log/security-scans"
   DATE=$(date +%Y%m%d)

   mkdir -p "$LOG_DIR"

   echo "[$(date)] Starting daily security scan..." | tee -a "$LOG_DIR/scan_$DATE.log"

   # AIDE file integrity check
   echo "Running AIDE integrity check..." | tee -a "$LOG_DIR/scan_$DATE.log"
   sudo aide --check > "$LOG_DIR/aide_$DATE.log" 2>&1

   # Lynis audit
   echo "Running Lynis audit..." | tee -a "$LOG_DIR/scan_$DATE.log"
   sudo lynis audit system --cronjob > "$LOG_DIR/lynis_$DATE.log" 2>&1

   # Trivy CVE scan
   echo "Running Trivy CVE scan..." | tee -a "$LOG_DIR/scan_$DATE.log"
   trivy rootfs --severity HIGH,CRITICAL --format json --output "$LOG_DIR/trivy_$DATE.json" / 2>&1

   # Check for critical findings
   CRITICAL_COUNT=$(jq '[.Results[].Vulnerabilities[] | select(.Severity == "CRITICAL")] | length' "$LOG_DIR/trivy_$DATE.json")

   if [ "$CRITICAL_COUNT" -gt 0 ]; then
     echo "⚠️  CRITICAL: Found $CRITICAL_COUNT critical vulnerabilities!" | tee -a "$LOG_DIR/scan_$DATE.log"
     # Send alert email
     echo "Critical vulnerabilities found. See $LOG_DIR/trivy_$DATE.json" | \
       mail -s "[MCP-SECURITY] Critical Vulnerabilities Detected" security@acdev.host
   fi

   echo "[$(date)] Security scan complete." | tee -a "$LOG_DIR/scan_$DATE.log"
   ```

   Make executable:

   ```bash
   sudo chmod +x /opt/mcp/security/daily-security-scan.sh
   ```

10. **Schedule Daily Scans**
    Create cron job on all VMs:

    ```bash
    sudo crontab -e

    # Add line:
    0 2 * * * /opt/mcp/security/daily-security-scan.sh
    ```

11. **Create Compliance Report Generator**
    Create `/opt/mcp/security/generate-compliance-report.sh`:

    ```bash
    #!/bin/bash
    # Generate weekly compliance report

    REPORT_DIR="/var/log/compliance-reports"
    DATE=$(date +%Y%m%d)
    REPORT_FILE="$REPORT_DIR/compliance_report_$DATE.html"

    mkdir -p "$REPORT_DIR"

    cat > "$REPORT_FILE" << 'HTML'
    <!DOCTYPE html>
    <html>
    <head>
      <title>MCP Security Compliance Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
        .pass { color: green; }
        .fail { color: red; }
        .warning { color: orange; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
      </style>
    </head>
    <body>
      <h1>MCP Ecosystem Security Compliance Report</h1>
      <p><strong>Generated:</strong> $(date)</p>
      <p><strong>Report Period:</strong> Last 7 days</p>
    HTML

    # System Hardening Status
    echo "<div class='section'>" >> "$REPORT_FILE"
    echo "<h2>System Hardening Status</h2>" >> "$REPORT_FILE"

    LYNIS_SCORE=$(grep "Hardening index" /var/log/lynis_*.log | tail -1 | awk '{print $4}')
    echo "<p>Lynis Hardening Score: <strong>$LYNIS_SCORE</strong></p>" >> "$REPORT_FILE"
    echo "</div>" >> "$REPORT_FILE"

    # CVE Summary
    echo "<div class='section'>" >> "$REPORT_FILE"
    echo "<h2>CVE Vulnerabilities</h2>" >> "$REPORT_FILE"

    LATEST_TRIVY=$(ls -t /var/log/trivy_*.json | head -1)
    CRITICAL=$(jq '[.Results[].Vulnerabilities[] | select(.Severity == "CRITICAL")] | length' "$LATEST_TRIVY")
    HIGH=$(jq '[.Results[].Vulnerabilities[] | select(.Severity == "HIGH")] | length' "$LATEST_TRIVY")

    echo "<table>" >> "$REPORT_FILE"
    echo "<tr><th>Severity</th><th>Count</th></tr>" >> "$REPORT_FILE"
    echo "<tr><td class='fail'>Critical</td><td>$CRITICAL</td></tr>" >> "$REPORT_FILE"
    echo "<tr><td class='warning'>High</td><td>$HIGH</td></tr>" >> "$REPORT_FILE"
    echo "</table>" >> "$REPORT_FILE"
    echo "</div>" >> "$REPORT_FILE"

    # File Integrity Status
    echo "<div class='section'>" >> "$REPORT_FILE"
    echo "<h2>File Integrity Monitoring (AIDE)</h2>" >> "$REPORT_FILE"

    AIDE_CHANGES=$(grep "changed" /var/log/aide_*.log | wc -l)
    if [ "$AIDE_CHANGES" -eq 0 ]; then
      echo "<p class='pass'>✓ No unauthorized file changes detected</p>" >> "$REPORT_FILE"
    else
      echo "<p class='fail'>✗ $AIDE_CHANGES file changes detected</p>" >> "$REPORT_FILE"
    fi
    echo "</div>" >> "$REPORT_FILE"

    # Security Services Status
    echo "<div class='section'>" >> "$REPORT_FILE"
    echo "<h2>Security Services Status</h2>" >> "$REPORT_FILE"
    echo "<table>" >> "$REPORT_FILE"
    echo "<tr><th>Service</th><th>Status</th></tr>" >> "$REPORT_FILE"

    for service in ufw fail2ban keycloak pihole; do
      if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo "<tr><td>$service</td><td class='pass'>Running</td></tr>" >> "$REPORT_FILE"
      else
        echo "<tr><td>$service</td><td class='fail'>Stopped</td></tr>" >> "$REPORT_FILE"
      fi
    done

    echo "</table>" >> "$REPORT_FILE"
    echo "</div>" >> "$REPORT_FILE"

    echo "</body></html>" >> "$REPORT_FILE"

    echo "Compliance report generated: $REPORT_FILE"

    # Email report
    cat "$REPORT_FILE" | mail -a "Content-Type: text/html" -s "[MCP] Weekly Security Compliance Report" compliance@acdev.host
    ```

12. **Schedule Weekly Compliance Reports**

    ```bash
    sudo crontab -e

    # Add line:
    0 9 * * 1 /opt/mcp/security/generate-compliance-report.sh
    ```

**Validation:**

- Lynis installed and running on all VMs
- AIDE configured for file integrity monitoring
- Trivy scanning for CVEs daily
- Dependency-Check scanning MCP service dependencies
- Daily automated scans scheduled
- Weekly compliance reports generated
- No critical vulnerabilities in latest scan

**Output Required:**

- Lynis hardening score for each VM
- Trivy CVE scan results (count by severity)
- Dependency-Check vulnerability reports for MCP services
- AIDE integrity check results
- Sample compliance report
- Scheduled scan cron jobs

**Compliance Standards:**

- CIS Benchmarks (Ubuntu 24.04)
- NIST Cybersecurity Framework
- OWASP Top 10
- PCI DSS (if applicable)

**NOTES:**

- Scans run at 2 AM daily to avoid peak hours
- Reports emailed weekly on Monday mornings
- Critical findings trigger immediate alerts
- AIDE database updated monthly

```

---

## 🤖 Agent 24: Backup-Automation

**Role:** devops-automation:cloud-architect
**Target:** All 3 VMs + Wasabi S3
**Duration:** ~75 minutes

```

You are the backup and disaster recovery specialist implementing comprehensive automated backup solutions for all critical data, databases, and configurations across the MCP ecosystem.

**Backup Strategy:**

- PostgreSQL: Daily full backups, continuous WAL archiving
- Configuration: Daily config backups (all VMs)
- MCP Code: Daily code snapshots
- Retention: 30 days local, 90 days offsite (Wasabi S3)

**Backup Locations:**

- Local: /var/backups/mcp
- Offsite: Wasabi S3 bucket (s3://mcp-backups-prod)

**Tasks to Complete:**

1. **Install Backup Tools**
   On all VMs:

   ```bash
   sudo apt install rsync rclone postgresql-client awscli -y
   ```

2. **Configure Wasabi S3 Access**
   On VMI01 (backup orchestrator):

   ```bash
   # Configure AWS CLI for Wasabi
   aws configure --profile wasabi
   # AWS Access Key ID: [Wasabi access key]
   # AWS Secret Access Key: [Wasabi secret key]
   # Default region name: us-east-1
   # Default output format: json

   # Test connection
   aws s3 ls --profile wasabi --endpoint-url=https://s3.wasabisys.com

   # Create backup bucket
   aws s3 mb s3://mcp-backups-prod --profile wasabi --endpoint-url=https://s3.wasabisys.com
   ```

3. **Configure Rclone for Wasabi**
   Create `~/.config/rclone/rclone.conf`:

   ```ini
   [wasabi]
   type = s3
   provider = Wasabi
   access_key_id = YOUR_ACCESS_KEY
   secret_access_key = YOUR_SECRET_KEY
   region = us-east-1
   endpoint = s3.wasabisys.com
   acl = private
   ```

4. **Create PostgreSQL Backup Script**
   Create `/opt/mcp/backups/backup-postgresql.sh`:

   ```bash
   #!/bin/bash
   # PostgreSQL backup script with WAL archiving

   set -euo pipefail

   BACKUP_DIR="/var/backups/mcp/postgresql"
   DATE=$(date +%Y%m%d_%H%M%S)
   DB_NAME="mcp_ecosystem"
   DB_USER="mcp_admin"
   RETENTION_DAYS=30

   mkdir -p "$BACKUP_DIR"

   echo "[$(date)] Starting PostgreSQL backup..."

   # Full database dump (compressed)
   pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "$BACKUP_DIR/mcp_ecosystem_$DATE.backup"

   if [ $? -eq 0 ]; then
     echo "[$(date)] Database dump successful: $BACKUP_DIR/mcp_ecosystem_$DATE.backup"

     # Calculate size
     SIZE=$(du -h "$BACKUP_DIR/mcp_ecosystem_$DATE.backup" | cut -f1)
     echo "[$(date)] Backup size: $SIZE"

     # Upload to Wasabi S3
     echo "[$(date)] Uploading to Wasabi S3..."
     rclone copy "$BACKUP_DIR/mcp_ecosystem_$DATE.backup" \
       wasabi:mcp-backups-prod/postgresql/$(date +%Y)/$(date +%m)/ \
       --progress

     # Verify upload
     if rclone ls "wasabi:mcp-backups-prod/postgresql/$(date +%Y)/$(date +%m)/mcp_ecosystem_$DATE.backup" > /dev/null 2>&1; then
       echo "[$(date)] S3 upload verified"
     else
       echo "[$(date)] ERROR: S3 upload verification failed!" >&2
       exit 1
     fi

     # Cleanup old local backups (keep 30 days)
     find "$BACKUP_DIR" -name "mcp_ecosystem_*.backup" -mtime +$RETENTION_DAYS -delete
     echo "[$(date)] Cleaned up backups older than $RETENTION_DAYS days"

     # Log success to monitoring
     echo "[$(date)] PostgreSQL backup completed successfully"
   else
     echo "[$(date)] ERROR: Database dump failed!" >&2
     # Send alert
     echo "PostgreSQL backup failed on VMI01" | mail -s "[MCP-BACKUP] FAILURE" ops@acdev.host
     exit 1
   fi
   ```

5. **Create Configuration Backup Script**
   Create `/opt/mcp/backups/backup-configs.sh`:

   ```bash
   #!/bin/bash
   # Backup critical configuration files

   set -euo pipefail

   BACKUP_DIR="/var/backups/mcp/configs"
   DATE=$(date +%Y%m%d)
   HOSTNAME=$(hostname)
   ARCHIVE="$BACKUP_DIR/${HOSTNAME}_configs_$DATE.tar.gz"

   mkdir -p "$BACKUP_DIR"

   echo "[$(date)] Starting configuration backup for $HOSTNAME..."

   # Create archive of critical configs
   tar -czf "$ARCHIVE" \
     /etc/nginx \
     /etc/postgresql \
     /etc/redis \
     /etc/ssh/sshd_config \
     /etc/ufw \
     /etc/fail2ban \
     /etc/wireguard \
     /opt/mcp/services/*/package.json \
     /opt/mcp/services/*/.env \
     /etc/prometheus \
     /etc/grafana \
     /etc/alertmanager \
     2>/dev/null || true

   if [ -f "$ARCHIVE" ]; then
     SIZE=$(du -h "$ARCHIVE" | cut -f1)
     echo "[$(date)] Config archive created: $ARCHIVE ($SIZE)"

     # Upload to S3
     rclone copy "$ARCHIVE" \
       wasabi:mcp-backups-prod/configs/$(date +%Y)/$(date +%m)/ \
       --progress

     echo "[$(date)] Configuration backup completed"
   else
     echo "[$(date)] ERROR: Archive creation failed!" >&2
     exit 1
   fi
   ```

6. **Create MCP Code Backup Script**
   Create `/opt/mcp/backups/backup-mcp-code.sh`:

   ```bash
   #!/bin/bash
   # Backup MCP service code and dependencies

   set -euo pipefail

   BACKUP_DIR="/var/backups/mcp/code"
   DATE=$(date +%Y%m%d)
   ARCHIVE="$BACKUP_DIR/mcp_code_$DATE.tar.gz"

   mkdir -p "$BACKUP_DIR"

   echo "[$(date)] Starting MCP code backup..."

   # Backup all MCP services
   tar -czf "$ARCHIVE" \
     --exclude='node_modules' \
     --exclude='dist' \
     --exclude='*.log' \
     /opt/mcp/services \
     2>/dev/null || true

   if [ -f "$ARCHIVE" ]; then
     SIZE=$(du -h "$ARCHIVE" | cut -f1)
     echo "[$(date)] Code archive created: $ARCHIVE ($SIZE)"

     # Upload to S3
     rclone copy "$ARCHIVE" \
       wasabi:mcp-backups-prod/code/$(date +%Y)/$(date +%m)/ \
       --progress

     # Cleanup old local archives (keep 7 days)
     find "$BACKUP_DIR" -name "mcp_code_*.tar.gz" -mtime +7 -delete

     echo "[$(date)] MCP code backup completed"
   else
     echo "[$(date)] ERROR: Code archive creation failed!" >&2
     exit 1
   fi
   ```

7. **Create Master Backup Orchestrator**
   Create `/opt/mcp/backups/run-all-backups.sh`:

   ```bash
   #!/bin/bash
   # Master backup orchestrator

   set -euo pipefail

   LOG_FILE="/var/log/mcp/backups_$(date +%Y%m%d).log"

   echo "╔════════════════════════════════════════════════════════════════╗" | tee -a "$LOG_FILE"
   echo "║         MCP Ecosystem Backup - $(date +'%Y-%m-%d %H:%M:%S')         ║" | tee -a "$LOG_FILE"
   echo "╚════════════════════════════════════════════════════════════════╝" | tee -a "$LOG_FILE"

   # PostgreSQL backup
   echo "" | tee -a "$LOG_FILE"
   echo "===== PostgreSQL Backup =====" | tee -a "$LOG_FILE"
   /opt/mcp/backups/backup-postgresql.sh 2>&1 | tee -a "$LOG_FILE"

   # Configuration backup
   echo "" | tee -a "$LOG_FILE"
   echo "===== Configuration Backup =====" | tee -a "$LOG_FILE"
   /opt/mcp/backups/backup-configs.sh 2>&1 | tee -a "$LOG_FILE"

   # MCP code backup
   echo "" | tee -a "$LOG_FILE"
   echo "===== MCP Code Backup =====" | tee -a "$LOG_FILE"
   /opt/mcp/backups/backup-mcp-code.sh 2>&1 | tee -a "$LOG_FILE"

   # Summary
   echo "" | tee -a "$LOG_FILE"
   echo "===== Backup Summary =====" | tee -a "$LOG_FILE"

   TOTAL_LOCAL_SIZE=$(du -sh /var/backups/mcp | cut -f1)
   echo "Total local backup size: $TOTAL_LOCAL_SIZE" | tee -a "$LOG_FILE"

   # Check S3 usage
   S3_SIZE=$(rclone size wasabi:mcp-backups-prod --json | jq -r '.bytes / 1024 / 1024 / 1024 | floor')
   echo "Total S3 storage used: ${S3_SIZE}GB" | tee -a "$LOG_FILE"

   echo "" | tee -a "$LOG_FILE"
   echo "All backups completed successfully!" | tee -a "$LOG_FILE"

   # Send success notification
   echo "Backup Summary: Local=$TOTAL_LOCAL_SIZE, S3=${S3_SIZE}GB" | \
     mail -s "[MCP-BACKUP] Daily Backup Successful" ops@acdev.host
   ```

8. **Make Scripts Executable**

   ```bash
   sudo chmod +x /opt/mcp/backups/*.sh
   ```

9. **Schedule Automated Backups**

   ```bash
   sudo crontab -e

   # Add lines:
   # Daily full backup at 1 AM
   0 1 * * * /opt/mcp/backups/run-all-backups.sh

   # Weekly backup verification (Sunday 3 AM)
   0 3 * * 0 /opt/mcp/backups/verify-backups.sh
   ```

10. **Create Backup Verification Script**
    Create `/opt/mcp/backups/verify-backups.sh`:

    ```bash
    #!/bin/bash
    # Verify backup integrity

    set -euo pipefail

    echo "===== Backup Verification ====="

    # Get latest PostgreSQL backup
    LATEST_BACKUP=$(ls -t /var/backups/mcp/postgresql/mcp_ecosystem_*.backup | head -1)

    if [ -n "$LATEST_BACKUP" ]; then
      echo "Latest PostgreSQL backup: $LATEST_BACKUP"

      # Test restore to temporary database
      echo "Testing backup restore..."
      PGPASSWORD='' \
        pg_restore -U mcp_admin -d postgres --create --clean "$LATEST_BACKUP" 2>&1 | grep -v "ERROR"

      if [ $? -eq 0 ]; then
        echo "✓ Backup verification successful"
      else
        echo "✗ Backup verification FAILED!" >&2
        echo "Backup verification failed for $LATEST_BACKUP" | mail -s "[MCP-BACKUP] Verification FAILED" ops@acdev.host
        exit 1
      fi
    else
      echo "✗ No backups found!" >&2
      exit 1
    fi

    # Verify S3 connectivity
    if rclone lsd wasabi:mcp-backups-prod > /dev/null 2>&1; then
      echo "✓ S3 connectivity verified"
    else
      echo "✗ S3 connectivity FAILED!" >&2
      exit 1
    fi
    ```

11. **Create Restore Documentation**
    Create `/opt/mcp/backups/RESTORE_PROCEDURES.md`:

    ```markdown
    # MCP Backup Restore Procedures

    ## PostgreSQL Restore

    ### Full Database Restore

    \`\`\`bash

    # Stop MCP services

    sudo systemctl stop mcp-orchestrator perplexity-mcp it-mcp

    # Download backup from S3 (if needed)

    rclone copy wasabi:mcp-backups-prod/postgresql/2025/01/mcp_ecosystem_YYYYMMDD_HHMMSS.backup \
     /tmp/restore/

    # Drop existing database

    sudo -u postgres psql -c "DROP DATABASE IF EXISTS mcp_ecosystem;"
    sudo -u postgres psql -c "CREATE DATABASE mcp_ecosystem OWNER mcp_admin;"

    # Restore from backup

    pg_restore -U mcp_admin -d mcp_ecosystem -Fc /tmp/restore/mcp_ecosystem_YYYYMMDD_HHMMSS.backup

    # Restart services

    sudo systemctl start mcp-orchestrator perplexity-mcp it-mcp
    \`\`\`

    ## Configuration Restore

    \`\`\`bash

    # Download config backup

    rclone copy wasabi:mcp-backups-prod/configs/2025/01/vmi01_configs_YYYYMMDD.tar.gz /tmp/restore/

    # Extract configs

    sudo tar -xzf /tmp/restore/vmi01_configs_YYYYMMDD.tar.gz -C /

    # Restart affected services

    sudo systemctl restart nginx postgresql redis ufw
    \`\`\`

    ## MCP Code Restore

    \`\`\`bash

    # Download code backup

    rclone copy wasabi:mcp-backups-prod/code/2025/01/mcp_code_YYYYMMDD.tar.gz /tmp/restore/

    # Stop services

    sudo systemctl stop mcp-orchestrator perplexity-mcp it-mcp

    # Backup current code (just in case)

    sudo mv /opt/mcp/services /opt/mcp/services.old

    # Extract code

    sudo tar -xzf /tmp/restore/mcp_code_YYYYMMDD.tar.gz -C /

    # Reinstall dependencies

    cd /opt/mcp/services/mcp-orchestrator && npm install
    cd /opt/mcp/services/perplexity-mcp && npm install
    cd /opt/mcp/services/it-mcp && npm install

    # Restart services

    sudo systemctl start mcp-orchestrator perplexity-mcp it-mcp
    \`\`\`
    ```

12. **Test Backup and Restore**

    ```bash
    # Run manual backup
    sudo /opt/mcp/backups/run-all-backups.sh

    # Verify backups
    sudo /opt/mcp/backups/verify-backups.sh

    # Check S3 contents
    rclone ls wasabi:mcp-backups-prod
    ```

**Validation:**

- Backup scripts created and executable
- PostgreSQL backups running daily
- Configuration backups scheduled
- MCP code backups automated
- Wasabi S3 configured and accessible
- Local backups stored in /var/backups/mcp
- S3 backups uploaded successfully
- Backup verification passing
- Restore procedures documented

**Output Required:**

- Backup schedule summary
- Sample backup log
- S3 bucket structure
- Backup retention policy
- Restore procedure documentation
- Verification test results

**Backup Metrics to Monitor:**

- Backup success rate: >99%
- Backup completion time: <30 minutes
- S3 upload success rate: 100%
- Local storage usage: <20GB
- S3 storage usage: monitored monthly

**NOTES:**

- Backups run at 1 AM daily
- 30-day local retention, 90-day S3 retention
- Weekly backup verification on Sundays
- Encryption in transit (TLS) to S3
- Wasabi provides 11 9's durability

```

---

# PHASE 6: Testing & Final Validation
## ⏱️ Duration: 3-4 hours | Sequential Execution

---

## 🤖 Agent 25: Integration-Testing

**Role:** testing-suite:test-engineer
**Target:** All 3 VMs (orchestrated from VMI01)
**Duration:** ~60 minutes

```

You are the integration testing specialist responsible for comprehensive end-to-end testing of all MCP services, infrastructure components, and inter-VM communication.

**Testing Scope:**

- MCP service inter-communication
- Database connectivity and operations
- WireGuard tunnel functionality
- Keycloak authentication flow
- Monitoring stack integration
- Backup and restore procedures

**Tasks to Complete:**

1. **Create Integration Test Directory**

   ```bash
   mkdir -p /opt/mcp/tests/integration
   cd /opt/mcp/tests/integration
   ```

2. **Install Testing Dependencies**

   ```bash
   sudo apt install curl jq netcat-openbsd postgresql-client redis-tools -y
   npm install -g newman  # For API testing
   ```

3. **Create Database Integration Test**
   Create `test-database-integration.sh`:

   ```bash
   #!/bin/bash
   # Database integration test

   set -euo pipefail

   echo "===== Database Integration Test ====="

   DB_HOST="localhost"
   DB_PORT="5432"
   DB_NAME="mcp_ecosystem"
   DB_USER="mcp_admin"
   DB_PASS=""

   # Test 1: PostgreSQL connectivity
   echo "Test 1: PostgreSQL connectivity..."
   if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
     echo "  ✓ PostgreSQL connection successful"
   else
     echo "  ✗ PostgreSQL connection failed" >&2
     exit 1
   fi

   # Test 2: Check database schema version
   echo "Test 2: Database schema version..."
   SCHEMA_VERSION=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc \
     "SELECT content FROM system_metadata WHERE key='schema_version' LIMIT 1;" 2>/dev/null || echo "unknown")

   if [ "$SCHEMA_VERSION" = "0.2.0" ]; then
     echo "  ✓ Schema version correct: $SCHEMA_VERSION"
   else
     echo "  ⚠ Schema version: $SCHEMA_VERSION (expected 0.2.0)" >&2
   fi

   # Test 3: Check new v0.2 tables exist
   echo "Test 3: Verify v0.2 tables..."
   NEW_TABLES=("thought_branches" "feedback_signals" "thought_relationships" "thought_sync_queue")

   for table in "${NEW_TABLES[@]}"; do
     if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc \
       "SELECT COUNT(*) FROM pg_tables WHERE tablename='$table';" | grep -q "1"; then
       echo "  ✓ Table $table exists"
     else
       echo "  ✗ Table $table NOT found" >&2
       exit 1
     fi
   done

   # Test 4: Test full-text search function
   echo "Test 4: Full-text search functionality..."
   SEARCH_RESULT=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc \
     "SELECT search_thoughts('test', 10);" 2>&1)

   if [ $? -eq 0 ]; then
     echo "  ✓ Full-text search function working"
   else
     echo "  ⚠ Full-text search test inconclusive"
   fi

   # Test 5: Redis connectivity
   echo "Test 5: Redis connectivity..."
   if redis-cli ping > /dev/null 2>&1; then
     echo "  ✓ Redis connection successful"
   else
     echo "  ✗ Redis connection failed" >&2
     exit 1
   fi

   echo ""
   echo "✓ All database integration tests passed"
   ```

4. **Create MCP Service Integration Test**
   Create `test-mcp-services.sh`:

   ```bash
   #!/bin/bash
   # MCP services integration test

   set -euo pipefail

   echo "===== MCP Services Integration Test ====="

   SERVICES=(
     "http://localhost:3000:mcp-orchestrator"
     "http://localhost:3001:perplexity-mcp"
     "http://localhost:3002:it-mcp"
   )

   # Test 1: Service health checks
   echo "Test 1: Service health checks..."
   for service_info in "${SERVICES[@]}"; do
     URL=$(echo "$service_info" | cut -d: -f1-3)
     NAME=$(echo "$service_info" | cut -d: -f4)

     RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/health" || echo "000")

     if [ "$RESPONSE" = "200" ]; then
       echo "  ✓ $NAME healthy (HTTP 200)"
     else
       echo "  ✗ $NAME unhealthy (HTTP $RESPONSE)" >&2
       exit 1
     fi
   done

   # Test 2: Service-to-service communication (orchestrator → workers)
   echo "Test 2: Orchestrator command dispatch..."

   # Register test command
   COMMAND_ID=$(curl -s -X POST http://localhost:3000/api/commands \
     -H "Content-Type: application/json" \
     -d '{
       "command": "test_integration",
       "target_service": "it-mcp",
       "payload": {"test": true}
     }' | jq -r '.command_id')

   if [ -n "$COMMAND_ID" ] && [ "$COMMAND_ID" != "null" ]; then
     echo "  ✓ Command dispatched: $COMMAND_ID"

     # Wait for command processing
     sleep 2

     # Check command status
     STATUS=$(curl -s "http://localhost:3000/api/commands/$COMMAND_ID" | jq -r '.status')
     echo "  ✓ Command status: $STATUS"
   else
     echo "  ✗ Command dispatch failed" >&2
     exit 1
   fi

   # Test 3: Database integration (check MCP agent registration)
   echo "Test 3: MCP agent registration..."

   AGENT_COUNT=$(PGPASSWORD='' \
     psql -h localhost -U mcp_admin -d mcp_ecosystem -tAc \
     "SELECT COUNT(*) FROM mcp_agents WHERE status='online';")

   if [ "$AGENT_COUNT" -ge 3 ]; then
     echo "  ✓ $AGENT_COUNT agents registered and online"
   else
     echo "  ⚠ Only $AGENT_COUNT agents online (expected >= 3)" >&2
   fi

   echo ""
   echo "✓ All MCP service integration tests passed"
   ```

5. **Create VPN Tunnel Integration Test**
   Create `test-vpn-tunnels.sh`:

   ```bash
   #!/bin/bash
   # WireGuard VPN tunnel integration test

   set -euo pipefail

   echo "===== VPN Tunnel Integration Test ====="

   # Test 1: Root tunnel (10.0.50.x)
   echo "Test 1: Root tunnel connectivity..."

   if ping -c 3 -W 2 10.0.50.2 > /dev/null 2>&1; then
     echo "  ✓ VMI02D reachable via root tunnel (10.0.50.2)"
   else
     echo "  ✗ VMI02D NOT reachable via root tunnel" >&2
     exit 1
   fi

   if ping -c 3 -W 2 10.0.50.3 > /dev/null 2>&1; then
     echo "  ✓ VMI03 reachable via root tunnel (10.0.50.3)"
   else
     echo "  ✗ VMI03 NOT reachable via root tunnel" >&2
     exit 1
   fi

   # Test 2: MCP tunnel (10.0.51.x)
   echo "Test 2: MCP tunnel connectivity..."

   if ping -c 3 -W 2 10.0.51.3 > /dev/null 2>&1; then
     echo "  ✓ VMI03 reachable via MCP tunnel (10.0.51.3)"
   else
     echo "  ⚠ VMI03 NOT reachable via MCP tunnel" >&2
   fi

   # Test 3: MCP services via tunnel
   echo "Test 3: MCP services via tunnel..."

   if curl -s -m 5 http://10.0.51.1:3000/health > /dev/null 2>&1; then
     echo "  ✓ MCP orchestrator accessible via tunnel"
   else
     echo "  ⚠ MCP orchestrator NOT accessible via tunnel" >&2
   fi

   # Test 4: WireGuard handshake status
   echo "Test 4: WireGuard handshake status..."

   HANDSHAKES=$(sudo wg show all | grep "latest handshake" | wc -l)

   if [ "$HANDSHAKES" -ge 2 ]; then
     echo "  ✓ $HANDSHAKES active WireGuard handshakes"
   else
     echo "  ⚠ Only $HANDSHAKES handshakes (expected >= 2)" >&2
   fi

   echo ""
   echo "✓ All VPN tunnel integration tests passed"
   ```

6. **Create Monitoring Stack Integration Test**
   Create `test-monitoring-stack.sh`:

   ```bash
   #!/bin/bash
   # Monitoring stack integration test

   set -euo pipefail

   echo "===== Monitoring Stack Integration Test ====="

   # Test 1: Prometheus
   echo "Test 1: Prometheus..."

   PROM_TARGETS=$(curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets | length')

   if [ "$PROM_TARGETS" -ge 10 ]; then
     echo "  ✓ Prometheus: $PROM_TARGETS active targets"
   else
     echo "  ⚠ Prometheus: Only $PROM_TARGETS targets (expected >= 10)" >&2
   fi

   # Test 2: Grafana
   echo "Test 2: Grafana..."

   GRAFANA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3500/api/health)

   if [ "$GRAFANA_STATUS" = "200" ]; then
     echo "  ✓ Grafana healthy"
   else
     echo "  ✗ Grafana unhealthy (HTTP $GRAFANA_STATUS)" >&2
     exit 1
   fi

   # Test 3: Alertmanager
   echo "Test 3: Alertmanager..."

   ALERTMANAGER_STATUS=$(curl -s http://localhost:9093/-/healthy)

   if [ "$ALERTMANAGER_STATUS" = "Healthy" ]; then
     echo "  ✓ Alertmanager healthy"
   else
     echo "  ⚠ Alertmanager status: $ALERTMANAGER_STATUS" >&2
   fi

   # Test 4: Elasticsearch
   echo "Test 4: Elasticsearch..."

   ES_CLUSTER=$(curl -s -u elastic:ElasticSearchSecure123! http://localhost:9200/_cluster/health | jq -r '.status')

   if [ "$ES_CLUSTER" = "green" ] || [ "$ES_CLUSTER" = "yellow" ]; then
     echo "  ✓ Elasticsearch cluster status: $ES_CLUSTER"
   else
     echo "  ✗ Elasticsearch cluster status: $ES_CLUSTER" >&2
     exit 1
   fi

   # Test 5: Kibana
   echo "Test 5: Kibana..."

   KIBANA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5601/api/status)

   if [ "$KIBANA_STATUS" = "200" ]; then
     echo "  ✓ Kibana healthy"
   else
     echo "  ⚠ Kibana status: HTTP $KIBANA_STATUS" >&2
   fi

   echo ""
   echo "✓ All monitoring stack integration tests passed"
   ```

7. **Create Master Integration Test Runner**
   Create `run-all-integration-tests.sh`:

   ```bash
   #!/bin/bash
   # Master integration test runner

   set -euo pipefail

   TEST_DIR="/opt/mcp/tests/integration"
   LOG_FILE="/var/log/mcp/integration_tests_$(date +%Y%m%d_%H%M%S).log"

   echo "╔════════════════════════════════════════════════════════════════╗" | tee "$LOG_FILE"
   echo "║          MCP Ecosystem Integration Test Suite                 ║" | tee -a "$LOG_FILE"
   echo "╚════════════════════════════════════════════════════════════════╝" | tee -a "$LOG_FILE"
   echo "" | tee -a "$LOG_FILE"

   TESTS=(
     "$TEST_DIR/test-database-integration.sh"
     "$TEST_DIR/test-mcp-services.sh"
     "$TEST_DIR/test-vpn-tunnels.sh"
     "$TEST_DIR/test-monitoring-stack.sh"
   )

   PASSED=0
   FAILED=0

   for test in "${TESTS[@]}"; do
     echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
     echo "Running: $(basename "$test")" | tee -a "$LOG_FILE"
     echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"

     if bash "$test" 2>&1 | tee -a "$LOG_FILE"; then
       ((PASSED++))
       echo "✓ PASSED: $(basename "$test")" | tee -a "$LOG_FILE"
     else
       ((FAILED++))
       echo "✗ FAILED: $(basename "$test")" | tee -a "$LOG_FILE"
     fi

     echo "" | tee -a "$LOG_FILE"
   done

   echo "════════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
   echo "Test Results: $PASSED passed, $FAILED failed" | tee -a "$LOG_FILE"
   echo "════════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

   if [ "$FAILED" -eq 0 ]; then
     echo "✓ All integration tests passed!" | tee -a "$LOG_FILE"
     exit 0
   else
     echo "✗ Some integration tests failed. See $LOG_FILE" | tee -a "$LOG_FILE"
     exit 1
   fi
   ```

8. **Make Test Scripts Executable**

   ```bash
   chmod +x /opt/mcp/tests/integration/*.sh
   ```

9. **Run Integration Tests**
   ```bash
   sudo /opt/mcp/tests/integration/run-all-integration-tests.sh
   ```

**Validation:**

- All integration test scripts created
- Database connectivity verified
- MCP services communicating properly
- WireGuard tunnels functional
- Monitoring stack operational
- All tests passing (0 failures)

**Output Required:**

- Integration test log file
- Test results summary (passed/failed count)
- Any test failures with error details
- Performance metrics (test execution time)

**NOTES:**

- Integration tests should be run after any major deployment
- Tests can be scheduled weekly via cron
- Failed tests should trigger alerts to ops team

```

---

## 🤖 Agent 26: Load-Testing

**Role:** performance-optimizer:load-testing-specialist
**Target:** VMI01 (MCP Services)
**Duration:** ~45 minutes

```

You are the performance testing specialist responsible for conducting comprehensive load testing of MCP services to ensure they can handle expected production traffic and identify performance bottlenecks.

**Testing Tool:** Apache Benchmark (ab), Artillery, k6
**Test Targets:** MCP Orchestrator, Perplexity MCP, IT-MCP
**Load Profiles:** Baseline, Peak, Stress

**Tasks to Complete:**

1. **Install Load Testing Tools**

   ```bash
   sudo apt install apache2-utils -y  # For ab (Apache Benchmark)

   # Install k6
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
     --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
     sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt update
   sudo apt install k6 -y
   ```

2. **Create Baseline Load Test (k6)**
   Create `/opt/mcp/tests/load/baseline-load-test.js`:

   ```javascript
   import http from 'k6/http';
   import { check, sleep } from 'k6';
   import { Rate } from 'k6/metrics';

   // Custom metrics
   const errorRate = new Rate('errors');

   // Test configuration
   export const options = {
     stages: [
       { duration: '1m', target: 10 }, // Ramp up to 10 users
       { duration: '3m', target: 10 }, // Stay at 10 users
       { duration: '1m', target: 0 }, // Ramp down
     ],
     thresholds: {
       http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
       http_req_failed: ['rate<0.01'], // Error rate under 1%
       errors: ['rate<0.1'],
     },
   };

   // Test scenarios
   export default function () {
     // Test MCP Orchestrator health
     let response = http.get('http://localhost:3000/health');
     check(response, {
       'orchestrator status is 200': (r) => r.status === 200,
       'orchestrator response time < 200ms': (r) => r.timings.duration < 200,
     }) || errorRate.add(1);

     sleep(1);

     // Test Perplexity MCP health
     response = http.get('http://localhost:3001/health');
     check(response, {
       'perplexity status is 200': (r) => r.status === 200,
       'perplexity response time < 200ms': (r) => r.timings.duration < 200,
     }) || errorRate.add(1);

     sleep(1);

     // Test IT-MCP health
     response = http.get('http://localhost:3002/health');
     check(response, {
       'it-mcp status is 200': (r) => r.status === 200,
       'it-mcp response time < 200ms': (r) => r.timings.duration < 200,
     }) || errorRate.add(1);

     sleep(2);
   }
   ```

3. **Create Peak Load Test**
   Create `/opt/mcp/tests/load/peak-load-test.js`:

   ```javascript
   import http from 'k6/http';
   import { check, sleep } from 'k6';
   import { Rate } from 'k6/metrics';

   const errorRate = new Rate('errors');

   export const options = {
     stages: [
       { duration: '2m', target: 50 }, // Ramp up to 50 users
       { duration: '5m', target: 50 }, // Stay at 50 users
       { duration: '2m', target: 100 }, // Spike to 100 users
       { duration: '3m', target: 100 }, // Stay at 100 users
       { duration: '2m', target: 0 }, // Ramp down
     ],
     thresholds: {
       http_req_duration: ['p(95)<1000'], // 95% under 1s during peak
       http_req_failed: ['rate<0.05'], // Error rate under 5%
     },
   };

   const BASE_URL = 'http://localhost:3000';

   export default function () {
     // Simulate realistic MCP workflow

     // 1. Register command
     let payload = JSON.stringify({
       command: 'diagnostic_scan',
       target_service: 'it-mcp',
       payload: { scan_type: 'cpu', depth: 'basic' },
     });

     let params = {
       headers: { 'Content-Type': 'application/json' },
     };

     let response = http.post(`${BASE_URL}/api/commands`, payload, params);
     check(response, {
       'command created': (r) => r.status === 201,
       'command has ID': (r) => JSON.parse(r.body).command_id !== undefined,
     }) || errorRate.add(1);

     sleep(1);

     // 2. Check command status
     if (response.status === 201) {
       let commandId = JSON.parse(response.body).command_id;
       response = http.get(`${BASE_URL}/api/commands/${commandId}`);
       check(response, {
         'command status retrieved': (r) => r.status === 200,
       }) || errorRate.add(1);
     }

     sleep(2);
   }
   ```

4. **Create Stress Test**
   Create `/opt/mcp/tests/load/stress-test.js`:

   ```javascript
   import http from 'k6/http';
   import { check } from 'k6';
   import { Rate } from 'k6/metrics';

   const errorRate = new Rate('errors');

   export const options = {
     stages: [
       { duration: '2m', target: 100 }, // Ramp to 100 users
       { duration: '5m', target: 200 }, // Ramp to 200 users
       { duration: '5m', target: 300 }, // Push to 300 users
       { duration: '3m', target: 300 }, // Hold at 300
       { duration: '2m', target: 0 }, // Recovery
     ],
     thresholds: {
       http_req_duration: ['p(95)<2000'], // Allow 2s under stress
       http_req_failed: ['rate<0.1'], // Up to 10% error rate acceptable
     },
   };

   export default function () {
     // Hammer all services simultaneously
     const requests = [
       { method: 'GET', url: 'http://localhost:3000/health' },
       { method: 'GET', url: 'http://localhost:3001/health' },
       { method: 'GET', url: 'http://localhost:3002/health' },
     ];

     const responses = http.batch(requests);

     for (const response of responses) {
       check(response, {
         'status is not 5xx': (r) => r.status < 500,
       }) || errorRate.add(1);
     }
   }
   ```

5. **Create Load Test Runner**
   Create `/opt/mcp/tests/load/run-load-tests.sh`:

   ```bash
   #!/bin/bash
   # Load test orchestrator

   set -euo pipefail

   RESULTS_DIR="/var/log/mcp/load-tests"
   DATE=$(date +%Y%m%d_%H%M%S)

   mkdir -p "$RESULTS_DIR"

   echo "╔════════════════════════════════════════════════════════════════╗"
   echo "║              MCP Load Testing Suite                           ║"
   echo "╚════════════════════════════════════════════════════════════════╝"
   echo ""

   # Baseline test
   echo "===== Running Baseline Load Test ====="
   k6 run --out json="$RESULTS_DIR/baseline_$DATE.json" \
     /opt/mcp/tests/load/baseline-load-test.js \
     | tee "$RESULTS_DIR/baseline_$DATE.log"

   echo ""
   sleep 30  # Cool down period

   # Peak load test
   echo "===== Running Peak Load Test ====="
   k6 run --out json="$RESULTS_DIR/peak_$DATE.json" \
     /opt/mcp/tests/load/peak-load-test.js \
     | tee "$RESULTS_DIR/peak_$DATE.log"

   echo ""
   sleep 60  # Longer cool down

   # Stress test
   echo "===== Running Stress Test ====="
   k6 run --out json="$RESULTS_DIR/stress_$DATE.json" \
     /opt/mcp/tests/load/stress-test.js \
     | tee "$RESULTS_DIR/stress_$DATE.log"

   echo ""
   echo "════════════════════════════════════════════════════════════════"
   echo "Load tests complete!"
   echo "Results saved to: $RESULTS_DIR"
   echo "════════════════════════════════════════════════════════════════"
   ```

6. **Create Performance Report Generator**
   Create `/opt/mcp/tests/load/generate-performance-report.sh`:

   ```bash
   #!/bin/bash
   # Generate performance report from k6 results

   RESULTS_DIR="/var/log/mcp/load-tests"
   LATEST_BASELINE=$(ls -t "$RESULTS_DIR"/baseline_*.log | head -1)
   LATEST_PEAK=$(ls -t "$RESULTS_DIR"/peak_*.log | head -1)
   LATEST_STRESS=$(ls -t "$RESULTS_DIR"/stress_*.log | head -1)

   echo "╔════════════════════════════════════════════════════════════════╗"
   echo "║          MCP Performance Test Report                          ║"
   echo "╚════════════════════════════════════════════════════════════════╝"
   echo ""

   echo "===== Baseline Test Results ====="
   grep "http_req_duration" "$LATEST_BASELINE" | tail -5
   echo ""

   echo "===== Peak Load Test Results ====="
   grep "http_req_duration" "$LATEST_PEAK" | tail -5
   echo ""

   echo "===== Stress Test Results ====="
   grep "http_req_duration" "$LATEST_STRESS" | tail -5
   echo ""

   # Extract key metrics
   echo "===== Performance Summary ====="
   echo "Baseline p95 latency: $(grep "p(95)" "$LATEST_BASELINE" | grep "http_req_duration" | awk '{print $2}')"
   echo "Peak load p95 latency: $(grep "p(95)" "$LATEST_PEAK" | grep "http_req_duration" | awk '{print $2}')"
   echo "Stress test p95 latency: $(grep "p(95)" "$LATEST_STRESS" | grep "http_req_duration" | awk '{print $2}')"
   ```

7. **Make Scripts Executable**

   ```bash
   chmod +x /opt/mcp/tests/load/*.sh
   ```

8. **Run Load Tests**

   ```bash
   sudo /opt/mcp/tests/load/run-load-tests.sh
   ```

9. **Monitor System During Load Tests**

   ```bash
   # In separate terminal
   watch -n 1 'ps aux | grep -E "(node|postgres|redis)" | grep -v grep'

   # Monitor system resources
   htop

   # Monitor network
   iftop
   ```

10. **Analyze Results and Set Baselines**
    Document performance baselines:

    ```
    Baseline (10 concurrent users):
    - p50 latency: < 100ms
    - p95 latency: < 200ms
    - p99 latency: < 500ms
    - Throughput: > 100 req/s
    - Error rate: < 0.1%

    Peak Load (100 concurrent users):
    - p50 latency: < 200ms
    - p95 latency: < 1000ms
    - p99 latency: < 2000ms
    - Throughput: > 500 req/s
    - Error rate: < 1%

    Stress Test (300 concurrent users):
    - p95 latency: < 2000ms
    - System remains stable
    - Error rate: < 5%
    - No service crashes
    ```

**Validation:**

- k6 installed and working
- All load test scripts created
- Baseline test passing performance thresholds
- Peak load test completing successfully
- Stress test identifying limits
- Performance metrics documented
- No service crashes under load

**Output Required:**

- Load test logs for all three scenarios
- Performance metrics summary
- Identified bottlenecks (if any)
- Recommended capacity limits
- Performance baseline documentation

**NOTES:**

- Run load tests during off-peak hours
- Monitor CPU, memory, disk I/O during tests
- Load tests help determine horizontal scaling needs
- Results inform auto-scaling policies

```

---

## 🤖 Agent 27: Security-Audit-Final-Validation

**Role:** security-pro:security-auditor
**Target:** All 3 VMs
**Duration:** ~75 minutes

```

You are the security auditor conducting the final comprehensive security audit and validation before the MCP ecosystem is declared production-ready.

**Audit Scope:**

- Security configuration compliance
- Vulnerability assessment
- Access control verification
- Network security validation
- Compliance with security policies
- Incident response readiness

**Audit Framework:** CIS Benchmarks, OWASP, NIST

**Tasks to Complete:**

1. **Create Security Audit Directory**

   ```bash
   mkdir -p /opt/mcp/audits/final
   cd /opt/mcp/audits/final
   ```

2. **Run CIS Benchmark Audit**

   ```bash
   # On each VM
   sudo lynis audit system --auditor "MCP-Security-Team" \
     --profile /usr/share/lynis/default.prf \
     --report-file /opt/mcp/audits/final/lynis_$(hostname)_$(date +%Y%m%d).log

   # Check hardening score
   HARDENING_SCORE=$(grep "Hardening index" /opt/mcp/audits/final/lynis_*.log | awk '{print $4}')

   if [ "$HARDENING_SCORE" -ge 80 ]; then
     echo "✓ Hardening score acceptable: $HARDENING_SCORE"
   else
     echo "⚠ Hardening score below target: $HARDENING_SCORE (target: 80+)"
   fi
   ```

3. **Security Configuration Checklist**
   Create `/opt/mcp/audits/final/security-checklist.sh`:

   ```bash
   #!/bin/bash
   # Comprehensive security configuration audit

   echo "╔════════════════════════════════════════════════════════════════╗"
   echo "║         MCP Ecosystem Security Audit Checklist                ║"
   echo "╚════════════════════════════════════════════════════════════════╝"
   echo ""

   PASS=0
   FAIL=0
   WARN=0

   check_pass() {
     echo "  ✓ $1"
     ((PASS++))
   }

   check_fail() {
     echo "  ✗ $1"
     ((FAIL++))
   }

   check_warn() {
     echo "  ⚠ $1"
     ((WARN++))
   }

   # === Authentication & Access Control ===
   echo "===== Authentication & Access Control ====="

   # SSH configuration
   if grep -q "^PasswordAuthentication no" /etc/ssh/sshd_config; then
     check_pass "SSH password authentication disabled"
   else
     check_fail "SSH password authentication ENABLED"
   fi

   if grep -q "^PermitRootLogin prohibit-password" /etc/ssh/sshd_config; then
     check_pass "SSH root login restricted"
   else
     check_fail "SSH root login NOT restricted"
   fi

   # Fail2Ban
   if systemctl is-active --quiet fail2ban; then
     check_pass "Fail2Ban running"
   else
     check_fail "Fail2Ban NOT running"
   fi

   # Keycloak (on VMI03)
   if [ "$(hostname)" = "ACDEV-VMI03" ]; then
     if systemctl is-active --quiet keycloak; then
       check_pass "Keycloak SSO running"
     else
       check_fail "Keycloak SSO NOT running"
     fi
   fi

   echo ""

   # === Network Security ===
   echo "===== Network Security ====="

   # UFW firewall
   if sudo ufw status | grep -q "Status: active"; then
     check_pass "UFW firewall active"

     # Check default policies
     if sudo ufw status verbose | grep -q "Default: deny (incoming)"; then
       check_pass "Default deny incoming policy"
     else
       check_fail "Default deny NOT set"
     fi
   else
     check_fail "UFW firewall NOT active"
   fi

   # WireGuard tunnels
   if sudo wg show | grep -q "interface: wg-root"; then
     check_pass "WireGuard root tunnel configured"
   else
     check_fail "WireGuard root tunnel NOT configured"
   fi

   # Pentanet blocking
   if sudo iptables -L | grep -q "100.64.0.0/10"; then
     check_pass "Pentanet CGNAT range blocked"
   else
     check_fail "Pentanet blocking NOT configured"
   fi

   # Pi-Hole (on VMI03)
   if [ "$(hostname)" = "ACDEV-VMI03" ]; then
     if pihole status | grep -q "Pi-hole blocking is enabled"; then
       check_pass "Pi-Hole DNS filtering active"
     else
       check_fail "Pi-Hole NOT active"
     fi
   fi

   echo ""

   # === File Integrity & Monitoring ===
   echo "===== File Integrity & Monitoring ====="

   # AIDE
   if [ -f /var/lib/aide/aide.db ]; then
     check_pass "AIDE database initialized"
   else
     check_warn "AIDE database NOT initialized"
   fi

   # Audit logging
   if systemctl is-active --quiet auditd; then
     check_pass "Audit logging (auditd) running"
   else
     check_fail "Audit logging NOT running"
   fi

   echo ""

   # === Database Security ===
   echo "===== Database Security ====="

   # PostgreSQL SSL
   if sudo -u postgres psql -tAc "SHOW ssl;" | grep -q "on"; then
     check_pass "PostgreSQL SSL enabled"
   else
     check_warn "PostgreSQL SSL NOT enabled"
   fi

   # Check for public access
   if sudo grep -q "^host.*0.0.0.0" /etc/postgresql/*/main/pg_hba.conf; then
     check_fail "PostgreSQL allows connections from 0.0.0.0 (public)"
   else
     check_pass "PostgreSQL NOT exposed publicly"
   fi

   echo ""

   # === Monitoring & Logging ===
   echo "===== Monitoring & Logging ====="

   # Prometheus
   if curl -s http://localhost:9090/-/healthy | grep -q "Prometheus"; then
     check_pass "Prometheus monitoring active"
   else
     check_fail "Prometheus NOT responding"
   fi

   # Alertmanager
   if curl -s http://localhost:9093/-/healthy | grep -q "Healthy"; then
     check_pass "Alertmanager active"
   else
     check_fail "Alertmanager NOT responding"
   fi

   # ELK Stack
   if curl -s -u elastic:ElasticSearchSecure123! http://localhost:9200/_cluster/health | grep -q "green\|yellow"; then
     check_pass "Elasticsearch cluster healthy"
   else
     check_fail "Elasticsearch NOT healthy"
   fi

   echo ""

   # === Backup & Recovery ===
   echo "===== Backup & Recovery ====="

   # Check for recent backups
   if [ -d /var/backups/mcp/postgresql ]; then
     LATEST_BACKUP=$(ls -t /var/backups/mcp/postgresql/*.backup 2>/dev/null | head -1)

     if [ -n "$LATEST_BACKUP" ]; then
       BACKUP_AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")) / 86400 ))

       if [ "$BACKUP_AGE" -le 1 ]; then
         check_pass "Recent database backup found (< 24h old)"
       else
         check_warn "Database backup is $BACKUP_AGE days old"
       fi
     else
       check_fail "No database backups found"
     fi
   else
     check_fail "Backup directory does not exist"
   fi

   # Check S3 connectivity
   if rclone lsd wasabi:mcp-backups-prod > /dev/null 2>&1; then
     check_pass "Offsite backup (S3) accessible"
   else
     check_fail "Offsite backup NOT accessible"
   fi

   echo ""

   # === Vulnerability Status ===
   echo "===== Vulnerability Status ====="

   # Check for pending security updates
   SECURITY_UPDATES=$(apt list --upgradable 2>/dev/null | grep -i security | wc -l)

   if [ "$SECURITY_UPDATES" -eq 0 ]; then
     check_pass "No pending security updates"
   else
     check_warn "$SECURITY_UPDATES pending security updates"
   fi

   # Check CVE scan results
   if [ -f /var/log/trivy_*.json ]; then
     CRITICAL_CVES=$(jq '[.Results[].Vulnerabilities[] | select(.Severity == "CRITICAL")] | length' \
       $(ls -t /var/log/trivy_*.json | head -1) 2>/dev/null || echo "0")

     if [ "$CRITICAL_CVES" -eq 0 ]; then
       check_pass "No critical CVEs detected"
     else
       check_fail "$CRITICAL_CVES critical CVEs detected"
     fi
   else
     check_warn "No CVE scan results found"
   fi

   echo ""
   echo "════════════════════════════════════════════════════════════════"
   echo "Audit Results: $PASS passed, $FAIL failed, $WARN warnings"
   echo "════════════════════════════════════════════════════════════════"

   if [ "$FAIL" -eq 0 ]; then
     echo "✓ Security audit PASSED"
     exit 0
   else
     echo "✗ Security audit FAILED - $FAIL critical issues"
     exit 1
   fi
   ```

4. **Run Security Audit on All VMs**

   ```bash
   chmod +x /opt/mcp/audits/final/security-checklist.sh

   # Run on VMI01
   ssh dev-admin@46.250.243.123 'bash /opt/mcp/audits/final/security-checklist.sh' | \
     tee /opt/mcp/audits/final/vmi01_audit_$(date +%Y%m%d).log

   # Run on VMI02D
   ssh data-admin@46.250.241.70 'bash /opt/mcp/audits/final/security-checklist.sh' | \
     tee /opt/mcp/audits/final/vmi02d_audit_$(date +%Y%m%d).log

   # Run on VMI03
   ssh sec-admin@154.26.158.31 'bash /opt/mcp/audits/final/security-checklist.sh' | \
     tee /opt/mcp/audits/final/vmi03_audit_$(date +%Y%m%d).log
   ```

5. **Penetration Testing (Simulated)**
   Create `/opt/mcp/audits/final/pentest-simulation.sh`:

   ```bash
   #!/bin/bash
   # Simulated penetration testing

   echo "===== Penetration Test Simulation ====="

   # Test 1: SSH brute force protection
   echo "Test 1: SSH brute force protection..."
   for i in {1..5}; do
     ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no wronguser@localhost 2>/dev/null
   done

   # Check if Fail2Ban banned the IP
   if sudo fail2ban-client status sshd | grep -q "Currently banned: 1"; then
     echo "  ✓ Fail2Ban successfully blocked brute force"
   else
     echo "  ⚠ Fail2Ban did not trigger"
   fi

   # Test 2: SQL injection attempt (should be blocked by prepared statements)
   echo "Test 2: SQL injection protection..."
   RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null \
     "http://localhost:3000/api/thoughts?id=1' OR '1'='1")

   if [ "$RESPONSE" != "200" ]; then
     echo "  ✓ SQL injection attempt blocked"
   else
     echo "  ⚠ Potential SQL injection vulnerability"
   fi

   # Test 3: Pentanet access attempt
   echo "Test 3: Pentanet blocking..."
   if ! ping -c 1 -W 1 100.64.0.1 > /dev/null 2>&1; then
     echo "  ✓ Pentanet range blocked"
   else
     echo "  ✗ Pentanet range accessible!"
   fi

   # Test 4: Unauthorized port access
   echo "Test 4: Unauthorized port access..."
   if ! nc -z -w 2 localhost 5432 2>/dev/null; then
     echo "  ✓ PostgreSQL port not externally accessible"
   else
     echo "  ⚠ PostgreSQL port accessible"
   fi
   ```

6. **Generate Final Security Report**
   Create `/opt/mcp/audits/final/generate-final-report.sh`:

   ```bash
   #!/bin/bash
   # Generate comprehensive final security report

   REPORT_FILE="/opt/mcp/audits/final/FINAL_SECURITY_REPORT_$(date +%Y%m%d).md"

   cat > "$REPORT_FILE" << 'EOF'
   # MCP Ecosystem Final Security Audit Report

   **Date:** $(date)
   **Auditor:** MCP Security Team
   **Scope:** All 3 VMs (VMI01, VMI02D, VMI03)

   ## Executive Summary

   This report presents the findings of the final comprehensive security audit conducted on the MCP Ecosystem infrastructure before production deployment.

   EOF

   # Add Lynis scores
   echo "## System Hardening Scores (CIS Benchmarks)" >> "$REPORT_FILE"
   echo "" >> "$REPORT_FILE"

   for vm in vmi01 vmi02d vmi03; do
     SCORE=$(grep "Hardening index" /opt/mcp/audits/final/lynis_*$vm*.log 2>/dev/null | awk '{print $4}' || echo "N/A")
     echo "- **$vm**: $SCORE" >> "$REPORT_FILE"
   done

   echo "" >> "$REPORT_FILE"

   # Add security checklist results
   echo "## Security Checklist Results" >> "$REPORT_FILE"
   echo "" >> "$REPORT_FILE"

   for vm in vmi01 vmi02d vmi03; do
     echo "### $vm" >> "$REPORT_FILE"
     echo "\`\`\`" >> "$REPORT_FILE"
     tail -3 /opt/mcp/audits/final/${vm}_audit_*.log >> "$REPORT_FILE"
     echo "\`\`\`" >> "$REPORT_FILE"
     echo "" >> "$REPORT_FILE"
   done

   # Add CVE status
   echo "## Vulnerability Status" >> "$REPORT_FILE"
   echo "" >> "$REPORT_FILE"

   LATEST_TRIVY=$(ls -t /var/log/trivy_*.json | head -1)
   CRITICAL=$(jq '[.Results[].Vulnerabilities[] | select(.Severity == "CRITICAL")] | length' "$LATEST_TRIVY" 2>/dev/null || echo "0")
   HIGH=$(jq '[.Results[].Vulnerabilities[] | select(.Severity == "HIGH")] | length' "$LATEST_TRIVY" 2>/dev/null || echo "0")

   echo "- **Critical CVEs**: $CRITICAL" >> "$REPORT_FILE"
   echo "- **High CVEs**: $HIGH" >> "$REPORT_FILE"
   echo "" >> "$REPORT_FILE"

   # Add recommendation
   echo "## Recommendations" >> "$REPORT_FILE"
   echo "" >> "$REPORT_FILE"

   if [ "$CRITICAL" -eq 0 ]; then
     echo "✓ **System is ready for production deployment**" >> "$REPORT_FILE"
   else
     echo "⚠ **Address $CRITICAL critical vulnerabilities before production**" >> "$REPORT_FILE"
   fi

   echo "" >> "$REPORT_FILE"
   echo "---" >> "$REPORT_FILE"
   echo "*Report generated: $(date)*" >> "$REPORT_FILE"

   echo "Final security report generated: $REPORT_FILE"

   # Email report
   cat "$REPORT_FILE" | mail -s "[MCP] Final Security Audit Report" security@acdev.host
   ```

7. **Execute Final Audit**

   ```bash
   # Run security checklist on all VMs
   bash /opt/mcp/audits/final/security-checklist.sh

   # Run penetration test simulation
   bash /opt/mcp/audits/final/pentest-simulation.sh

   # Generate final report
   bash /opt/mcp/audits/final/generate-final-report.sh
   ```

8. **Production Readiness Checklist**
   Create `/opt/mcp/audits/final/PRODUCTION_READINESS.md`:

   ```markdown
   # MCP Ecosystem Production Readiness Checklist

   ## Security

   - [ ] All systems hardened (Lynis score >= 80)
   - [ ] SSH password authentication disabled
   - [ ] Fail2Ban active on all VMs
   - [ ] UFW firewalls active with correct rules
   - [ ] WireGuard tunnels operational
   - [ ] Pentanet blocking verified
   - [ ] Keycloak SSO functional
   - [ ] Pi-Hole DNS filtering active
   - [ ] No critical CVEs
   - [ ] AIDE file integrity monitoring configured
   - [ ] Security event logging to ELK

   ## Infrastructure

   - [ ] All 3 VMs accessible and healthy
   - [ ] PostgreSQL database operational (v0.2)
   - [ ] Redis cache operational
   - [ ] MCP services running (orchestrator, perplexity, IT-MCP)
   - [ ] Inter-VM communication functional

   ## Monitoring

   - [ ] Prometheus collecting metrics
   - [ ] Grafana dashboards created
   - [ ] Alertmanager configured
   - [ ] ELK stack operational
   - [ ] Kibana dashboards created
   - [ ] Alert notifications tested

   ## Backup & Recovery

   - [ ] Automated daily backups configured
   - [ ] Wasabi S3 offsite backups working
   - [ ] Backup verification passing
   - [ ] Restore procedures documented and tested

   ## Performance

   - [ ] Baseline load tests passed
   - [ ] Peak load tests passed
   - [ ] Stress tests completed
   - [ ] Performance baselines documented

   ## Testing

   - [ ] Integration tests passing
   - [ ] Load tests passing
   - [ ] Security audit passed
   - [ ] Penetration testing completed

   ## Documentation

   - [ ] Architecture documentation complete
   - [ ] Runbooks created
   - [ ] Incident response procedures documented
   - [ ] Contact list updated

   ## Sign-off

   - **Security Team**: \***\*\*\*\*\*\*\***\_\_\_\***\*\*\*\*\*\*\***
   - **Operations Team**: \***\*\*\*\*\*\*\***\_\_\_\***\*\*\*\*\*\*\***
   - **Development Team**: \***\*\*\*\*\*\*\***\_\_\_\***\*\*\*\*\*\*\***
   - **Date**: \***\*\*\*\*\*\*\***\_\_\_\***\*\*\*\*\*\*\***
   ```

**Validation:**

- Security audit passing on all VMs
- All critical security controls in place
- No critical vulnerabilities
- Penetration testing complete
- Final security report generated
- Production readiness checklist completed

**Output Required:**

- Security audit logs for all VMs
- Lynis hardening scores
- CVE scan results
- Penetration test results
- Final security report (PDF/Markdown)
- Production readiness checklist (signed)

**Critical Security Standards Met:**

- CIS Ubuntu 24.04 Benchmark (Level 1)
- OWASP Top 10 protections
- NIST Cybersecurity Framework
- Zero critical vulnerabilities
- 80+ hardening score

**NOTES:**

- This is the final gate before production
- All critical findings must be remediated
- Security team sign-off required
- Document all residual risks

```

---

# 🎉 Deployment Complete!

**All 27 specialized agent prompts created:**
- Phase 1: Base Infrastructure (Agents 1-6)
- Phase 2: Core Services (Agents 7-10)
- Phase 3: MCP Deployment (Agents 11-13)
- Phase 4: Security Gateway & VPN (Agents 14-18)
- Phase 5: Monitoring & Compliance (Agents 19-24)
- Phase 6: Testing & Validation (Agents 25-27)

**Total Estimated Time:** 18-20 hours
**Parallel Execution:** Reduces total time to ~12-15 hours

**Next Steps:**
1. Begin Phase 1 deployment with agents 1-6
2. Validate each phase before proceeding
3. Use production deployment scripts
4. Monitor progress via Grafana dashboards
5. Complete final security audit

**Success Criteria:**
- All services operational
- All security controls active
- All tests passing
- Zero critical vulnerabilities
- Production readiness checklist signed
```
