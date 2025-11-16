#!/bin/bash
# =====================================================
# MCP ECOSYSTEM SCHEMA DEPLOYMENT SCRIPT
# =====================================================
# Target: VMI01 (46.250.243.123)
# User: root
# Date: 2025-11-05

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"
DB_PASSWORD=""
SCHEMA_FILE="/opt/mcp-schema.sql"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}MCP Ecosystem Schema Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Create database
echo -e "${YELLOW}[1/6] Creating database: ${DB_NAME}${NC}"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || echo "  Database already exists (skipping)"

# Step 2: Create user with password
echo -e "${YELLOW}[2/6] Creating user: ${DB_USER}${NC}"
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH ENCRYPTED PASSWORD '${DB_PASSWORD}';" 2>/dev/null || echo "  User already exists (skipping)"

# Step 3: Grant privileges
echo -e "${YELLOW}[3/6] Granting privileges${NC}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -d ${DB_NAME} -c "GRANT ALL PRIVILEGES ON SCHEMA public TO ${DB_USER};"
sudo -u postgres psql -d ${DB_NAME} -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};"
sudo -u postgres psql -d ${DB_NAME} -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};"
sudo -u postgres psql -d ${DB_NAME} -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};"
sudo -u postgres psql -d ${DB_NAME} -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};"

# Step 4: Enable extensions
echo -e "${YELLOW}[4/6] Enabling PostgreSQL extensions${NC}"
sudo -u postgres psql -d ${DB_NAME} -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
sudo -u postgres psql -d ${DB_NAME} -c "CREATE EXTENSION IF NOT EXISTS \"pg_stat_statements\";"
sudo -u postgres psql -d ${DB_NAME} -c "CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";"
echo -e "${GREEN}  ✓ Extensions enabled${NC}"

# Step 5: Execute schema
echo -e "${YELLOW}[5/6] Executing schema creation${NC}"
echo -e "  This may take a minute..."
sudo -u postgres psql -d ${DB_NAME} -f ${SCHEMA_FILE} > /tmp/schema_deployment.log 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Schema created successfully${NC}"
else
    echo -e "${RED}  ✗ Schema creation failed. Check /tmp/schema_deployment.log${NC}"
    exit 1
fi

# Step 6: Validation
echo -e "${YELLOW}[6/6] Validating schema${NC}"

# Count tables
TABLE_COUNT=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
echo -e "  Tables created: ${GREEN}${TABLE_COUNT}${NC}"

# Count views
VIEW_COUNT=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT count(*) FROM information_schema.views WHERE table_schema = 'public';")
echo -e "  Views created: ${GREEN}${VIEW_COUNT}${NC}"

# Count materialized views
MATVIEW_COUNT=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT count(*) FROM pg_matviews WHERE schemaname = 'public';")
echo -e "  Materialized views: ${GREEN}${MATVIEW_COUNT}${NC}"

# Count functions
FUNCTION_COUNT=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT count(*) FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND prokind = 'f';")
echo -e "  Functions created: ${GREEN}${FUNCTION_COUNT}${NC}"

# Count triggers
TRIGGER_COUNT=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT count(*) FROM pg_trigger WHERE tgname NOT LIKE 'pg_%';")
echo -e "  Triggers created: ${GREEN}${TRIGGER_COUNT}${NC}"

# Refresh materialized view
echo -e "  Refreshing materialized views..."
sudo -u postgres psql -d ${DB_NAME} -c "REFRESH MATERIALIZED VIEW service_directory;" > /dev/null 2>&1
echo -e "${GREEN}  ✓ Materialized views refreshed${NC}"

# Test function
echo -e "  Testing get_least_loaded_agent() function..."
FUNCTION_TEST=$(sudo -u postgres psql -d ${DB_NAME} -t -c "SELECT get_least_loaded_agent(ARRAY['local-shell']::text[]);")
echo -e "${GREEN}  ✓ Function test completed${NC}"

# List all tables
echo ""
echo -e "${BLUE}Tables created:${NC}"
sudo -u postgres psql -d ${DB_NAME} -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" | head -30

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Database Credentials:${NC}"
echo -e "  Database: ${GREEN}${DB_NAME}${NC}"
echo -e "  User: ${GREEN}${DB_USER}${NC}"
echo -e "  Password: ${GREEN}${DB_PASSWORD}${NC}"
echo -e "  Host: ${GREEN}localhost${NC}"
echo -e "  Port: ${GREEN}5432${NC}"
echo ""
echo -e "${YELLOW}Connection String:${NC}"
echo -e "  ${GREEN}postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}${NC}"
echo ""
echo -e "${YELLOW}Test Connection:${NC}"
echo -e "  ${BLUE}psql -h localhost -U ${DB_USER} -d ${DB_NAME}${NC}"
echo ""
echo -e "${YELLOW}Schema file stored at:${NC}"
echo -e "  ${GREEN}${SCHEMA_FILE}${NC}"
echo ""
echo -e "${RED}IMPORTANT: Save the credentials securely!${NC}"
echo ""
