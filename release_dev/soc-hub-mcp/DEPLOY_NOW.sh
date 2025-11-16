#!/usr/bin/env bash
# SOC Hub - Quick Deploy Commands
# Copy and paste these commands one by one

set -e

echo "========================================="
echo "SOC Hub Deployment - Step by Step"
echo "========================================="
echo
echo "Follow these steps (you'll be prompted for password):"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Transfer Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
cat << 'EOF'
cd "/Users/alex/Projects/MCP Bundle/release_dev/soc-hub-mcp"
scp -r dist package.json package-lock.json .env deployment README.md root@154.26.158.31:/opt/mcp/soc-hub-mcp/
EOF
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: SSH and Install Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
cat << 'EOF'
ssh root@154.26.158.31

# Once logged in:
cd /opt/mcp/soc-hub-mcp
npm ci --only=production
EOF
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Get Elasticsearch Password"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
cat << 'EOF'
# (Still on VMI03)
cat /opt/mcp/credentials/elasticsearch.txt
EOF
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4: Update Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
cat << 'EOF'
# Edit the .env file
nano /opt/mcp/soc-hub-mcp/.env

# Update these lines:
# ELASTICSEARCH_PASSWORD=<paste password from step 3>
# THEHIVE_API_KEY=<get from http://154.26.158.31:9000>

# Save and exit (Ctrl+X, Y, Enter)
EOF
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 5: Install and Start Service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
cat << 'EOF'
# Copy systemd service
cp /opt/mcp/soc-hub-mcp/deployment/soc-hub-mcp.service /etc/systemd/system/

# Enable and start
systemctl daemon-reload
systemctl enable soc-hub-mcp
systemctl start soc-hub-mcp

# Check status
systemctl status soc-hub-mcp
EOF
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 6: Verify Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
cat << 'EOF'
# View logs
journalctl -u soc-hub-mcp -f

# Test API (in another terminal)
curl http://154.26.158.31:3200/api/v1/health | jq .
curl http://154.26.158.31:3200/api/v1/dashboard | jq .data.overview
EOF
echo
echo "========================================="
echo "Ready to deploy! Follow the steps above."
echo "========================================="
