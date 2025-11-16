#!/bin/bash
################################################################################
# add-test-data-via-api.sh - Add test data directly to Elasticsearch
#
# This script adds comprehensive test data through direct Elasticsearch access
################################################################################

set -euo pipefail

# Colors
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Configuration
readonly ES_URL="http://154.26.158.31:9200"
readonly INDEX_NAME="suricata-$(date -u +%Y.%m.%d)"

echo -e "${BLUE}=== Adding Test Data to Elasticsearch ===${NC}"
echo "Target: ${ES_URL}"
echo "Index: ${INDEX_NAME}"
echo ""

# Get timestamps
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
ONE_HOUR_AGO=$(date -u -v-1H +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u --date='1 hour ago' +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S.000Z")
TWO_HOURS_AGO=$(date -u -v-2H +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u --date='2 hours ago' +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S.000Z")

echo -e "${YELLOW}Checking Elasticsearch connectivity...${NC}"
if ! curl -s -f "${ES_URL}/" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Cannot connect directly to Elasticsearch${NC}"
    echo "This is expected if Elasticsearch only listens on localhost"
    echo "Skipping direct data upload - use SSH access to add data"
    exit 0
fi

echo -e "${GREEN}✓ Connected to Elasticsearch${NC}"

# Delete old index
echo -e "${YELLOW}Cleaning old data...${NC}"
curl -X DELETE "${ES_URL}/suricata-*" 2>/dev/null || true

# Create index with proper mappings
echo -e "${YELLOW}Creating index with mappings...${NC}"
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
          "signature": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
          "category": {"type": "keyword"},
          "severity": {"type": "integer"}
        }
      }
    }
  }
}' 2>/dev/null

echo -e "${YELLOW}Adding diverse alert dataset...${NC}"

# Alert 1: SSH Brute Force
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
}" 2>/dev/null

# Alert 2: SQL Injection
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${ONE_HOUR_AGO}\",
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
}" 2>/dev/null

# Alert 3: MySQL Port Scan
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${TWO_HOURS_AGO}\",
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
}" 2>/dev/null

# Alert 4: RDP Brute Force
curl -X POST "${ES_URL}/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${ONE_HOUR_AGO}\",
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
}" 2>/dev/null

# Alert 5: Web Shell Upload
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
}" 2>/dev/null

# Refresh index
curl -X POST "${ES_URL}/${INDEX_NAME}/_refresh" 2>/dev/null

echo ""
echo -e "${GREEN}✓ Successfully added 5 diverse alerts${NC}"
echo ""
echo "Verify with:"
echo "  curl '${ES_URL}/${INDEX_NAME}/_count'"
echo ""
