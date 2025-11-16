#!/bin/bash
################################################################################
# fix-elasticsearch-aggregations.sh
#
# Execute this script ON THE VMI03 SERVER to fix Elasticsearch aggregations
#
# Usage: ./fix-elasticsearch-aggregations.sh
################################################################################

set -euo pipefail

# Colors
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

echo -e "${BLUE}=== Fixing Elasticsearch Aggregations ===${NC}"
echo ""

# Check if running on server
if [ ! -f "/opt/mcp/soc-hub-mcp/.env" ]; then
    echo -e "${RED}Error: This script must be run ON the VMI03 server${NC}"
    echo "Please SSH to the server first:"
    echo "  ssh root@154.26.158.31"
    echo "  bash fix-elasticsearch-aggregations.sh"
    exit 1
fi

readonly ES_URL="http://localhost:9200"
readonly INDEX_NAME="suricata-$(date -u +%Y.%m.%d)"

# Step 1: Test Elasticsearch connectivity
echo -e "${YELLOW}[1/5] Testing Elasticsearch connectivity...${NC}"
if ! curl -sf "${ES_URL}/" > /dev/null; then
    echo -e "${RED}✗ Elasticsearch is not responding${NC}"
    echo "Trying to start Elasticsearch..."
    systemctl start elasticsearch
    sleep 10
    if ! curl -sf "${ES_URL}/" > /dev/null; then
        echo -e "${RED}✗ Elasticsearch failed to start${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ Elasticsearch is running${NC}"

# Step 2: Delete old indices
echo -e "${YELLOW}[2/5] Cleaning old indices...${NC}"
curl -X DELETE "${ES_URL}/suricata-*" 2>/dev/null || true
echo -e "${GREEN}✓ Old indices removed${NC}"

# Step 3: Create index with proper mappings
echo -e "${YELLOW}[3/5] Creating index with proper field mappings...${NC}"
curl -X PUT "${ES_URL}/${INDEX_NAME}" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "@timestamp": {"type": "date"},
      "event_type": {"type": "keyword"},
      "src_ip": {"type": "ip"},
      "dest_ip": {"type": "ip"},
      "src_port": {"type": "integer"},
      "dest_port": {"type": "integer"},
      "proto": {"type": "keyword"},
      "alert": {
        "properties": {
          "signature": {
            "type": "text",
            "fields": {"keyword": {"type": "keyword"}}
          },
          "category": {"type": "keyword"},
          "severity": {"type": "integer"}
        }
      }
    }
  }
}' 2>/dev/null

echo -e "${GREEN}✓ Index created: ${INDEX_NAME}${NC}"

# Step 4: Add current test data
echo -e "${YELLOW}[4/5] Adding fresh test data with current timestamps...${NC}"

CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# SSH Brute Force (Critical)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"192.168.1.100\",
  \"dest_ip\": \"10.0.1.10\",
  \"src_port\": 54321,
  \"dest_port\": 22,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET SCAN Potential SSH Scan\",
    \"category\": \"Attempted Administrator Privilege Gain\",
    \"severity\": 1
  }
}" 2>/dev/null && echo -n "."

# SQL Injection (Critical)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"203.0.113.45\",
  \"dest_ip\": \"10.0.1.20\",
  \"src_port\": 44567,
  \"dest_port\": 80,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET WEB_SERVER SQL Injection Attempt\",
    \"category\": \"Web Application Attack\",
    \"severity\": 1
  }
}" 2>/dev/null && echo -n "."

# RDP Brute Force (Critical)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"185.220.101.50\",
  \"dest_ip\": \"10.0.1.40\",
  \"src_port\": 35678,
  \"dest_port\": 3389,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET EXPLOIT RDP Brute Force Attempt\",
    \"category\": \"Attempted Administrator Privilege Gain\",
    \"severity\": 1
  }
}" 2>/dev/null && echo -n "."

# Web Shell Upload (Critical)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"45.142.212.61\",
  \"dest_ip\": \"10.0.1.20\",
  \"src_port\": 42156,
  \"dest_port\": 80,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET WEB_SERVER Possible Web Shell Upload\",
    \"category\": \"Web Application Attack\",
    \"severity\": 1
  }
}" 2>/dev/null && echo -n "."

# MySQL Port Scan (Medium)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"198.51.100.78\",
  \"dest_ip\": \"10.0.1.30\",
  \"src_port\": 12345,
  \"dest_port\": 3306,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET SCAN Suspicious inbound to mySQL port 3306\",
    \"category\": \"Potentially Bad Traffic\",
    \"severity\": 2
  }
}" 2>/dev/null && echo -n "."

# C2 Communication (Critical)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"10.0.1.60\",
  \"dest_ip\": \"185.220.101.25\",
  \"src_port\": 49876,
  \"dest_port\": 443,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET MALWARE Known C2 Server Traffic\",
    \"category\": \"A Network Trojan was detected\",
    \"severity\": 1
  }
}" 2>/dev/null && echo -n "."

# SMB Enumeration (Medium)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"192.168.1.150\",
  \"dest_ip\": \"10.0.1.70\",
  \"src_port\": 45123,
  \"dest_port\": 445,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET POLICY SMB Share Enumeration\",
    \"category\": \"Attempted Information Leak\",
    \"severity\": 2
  }
}" 2>/dev/null && echo -n "."

# DNS Tunneling (Medium)
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"10.0.1.50\",
  \"dest_ip\": \"8.8.8.8\",
  \"src_port\": 51234,
  \"dest_port\": 53,
  \"proto\": \"UDP\",
  \"alert\": {
    \"signature\": \"ET POLICY DNS Query to Suspicious TLD\",
    \"category\": \"Potentially Bad Traffic\",
    \"severity\": 2
  }
}" 2>/dev/null && echo -n "."

echo ""
echo -e "${GREEN}✓ Added 8 test alerts${NC}"

# Refresh index
curl -X POST "${ES_URL}/${INDEX_NAME}/_refresh" 2>/dev/null
echo -e "${GREEN}✓ Index refreshed${NC}"

# Step 5: Verify aggregations
echo -e "${YELLOW}[5/5] Verifying aggregations...${NC}"

AGGREGATION_RESULT=$(curl -s "${ES_URL}/${INDEX_NAME}/_search" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "query": {
    "bool": {
      "must": [
        {"term": {"event_type": "alert"}},
        {"range": {"@timestamp": {"gte": "now-24h"}}}
      ]
    }
  },
  "aggs": {
    "top_dest_ips": {"terms": {"field": "dest_ip", "size": 10}},
    "top_dest_ports": {"terms": {"field": "dest_port", "size": 10}}
  }
}' 2>/dev/null)

IP_COUNT=$(echo "$AGGREGATION_RESULT" | jq -r '.aggregations.top_dest_ips.buckets | length')
PORT_COUNT=$(echo "$AGGREGATION_RESULT" | jq -r '.aggregations.top_dest_ports.buckets | length')

echo "Top target IPs found: ${IP_COUNT}"
echo "Top target ports found: ${PORT_COUNT}"

if [ "$IP_COUNT" -gt 0 ] && [ "$PORT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Aggregations working correctly!${NC}"
else
    echo -e "${RED}✗ Aggregations still not working${NC}"
    echo "Debug info:"
    echo "$AGGREGATION_RESULT" | jq '.aggregations'
    exit 1
fi

# Restart SOC Hub to pick up new data
echo -e "${YELLOW}Restarting SOC Hub...${NC}"
systemctl restart soc-hub-mcp
sleep 3

echo ""
echo -e "${BLUE}=== Fix Complete ===${NC}"
echo ""
echo "Test from your local machine:"
echo "  curl -s 'http://154.26.158.31:3200/api/v1/stats/elasticsearch' | jq '.data.top_targets'"
echo ""
echo "You should see IPs and ports in the aggregation results."
echo ""
