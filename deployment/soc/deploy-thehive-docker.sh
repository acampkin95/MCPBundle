#!/bin/bash
################################################################################
# deploy-thehive-docker.sh
#
# Deploy TheHive 5 using Docker Compose
#
# Execute this script ON THE VMI03 SERVER
#
# Usage: ./deploy-thehive-docker.sh
################################################################################

set -euo pipefail

# Colors
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

echo -e "${BLUE}=== Deploying TheHive via Docker ===${NC}"
echo ""

################################################################################
# Step 1: Install Docker
################################################################################

echo -e "${YELLOW}[1/5] Checking Docker installation...${NC}"

if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}✓ Docker installed${NC}"
else
    echo -e "${GREEN}✓ Docker already installed${NC}"
    docker --version
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✓ Docker Compose installed${NC}"
else
    echo -e "${GREEN}✓ Docker Compose already installed${NC}"
    docker-compose --version
fi

################################################################################
# Step 2: Create TheHive Directory and Configuration
################################################################################

echo -e "${YELLOW}[2/5] Creating TheHive configuration...${NC}"

THEHIVE_DIR="/opt/thehive"
mkdir -p "$THEHIVE_DIR"
cd "$THEHIVE_DIR"

# Generate secret key
SECRET_KEY=$(openssl rand -hex 32)

# Create Docker Compose file
cat > docker-compose.yml <<EOF
version: '3.8'

services:
  cassandra:
    image: cassandra:4.1
    container_name: thehive-cassandra
    restart: unless-stopped
    hostname: cassandra
    environment:
      - MAX_HEAP_SIZE=1G
      - HEAP_NEWSIZE=512M
      - CASSANDRA_CLUSTER_NAME=thp
    volumes:
      - cassandra-data:/var/lib/cassandra
    networks:
      - thehive-net

  thehive:
    image: strangebee/thehive:5.2
    container_name: thehive
    restart: unless-stopped
    depends_on:
      - cassandra
    ports:
      - "9000:9000"
    environment:
      - JVM_OPTS=-Xms1G -Xmx1G
    volumes:
      - thehive-data:/opt/thp/thehive/data
      - thehive-index:/opt/thp/thehive/index
      - ./application.conf:/etc/thehive/application.conf
    networks:
      - thehive-net
    command:
      - --secret
      - "${SECRET_KEY}"

volumes:
  cassandra-data:
  thehive-data:
  thehive-index:

networks:
  thehive-net:
    driver: bridge
EOF

# Create application.conf
cat > application.conf <<EOF
# TheHive Configuration

play.http.secret.key="${SECRET_KEY}"

# Database configuration
db {
  provider: janusgraph
  janusgraph {
    storage {
      backend: cql
      hostname: ["cassandra"]
      cql {
        cluster-name: thp
        keyspace: thehive
      }
    }
    index.search {
      backend: lucene
      directory: /opt/thp/thehive/index
    }
  }
}

# Storage configuration
storage {
  provider: localfs
  localfs.location: /opt/thp/thehive/data
}

# Service configuration
play.modules.enabled += org.thp.thehive.connector.cortex.CortexModule
cortex {
  servers: []
}

# Authentication
auth {
  providers: [
    {name: session}
    {name: basic, realm: thehive}
    {name: local}
    {name: key}
  ]
}
EOF

echo -e "${GREEN}✓ Configuration created${NC}"
echo "Secret key generated: ${SECRET_KEY}"

################################################################################
# Step 3: Start TheHive
################################################################################

echo -e "${YELLOW}[3/5] Starting TheHive containers...${NC}"

docker-compose up -d

echo ""
echo "Waiting for services to initialize (this may take 2-3 minutes)..."
echo "Cassandra needs time to create the keyspace..."
sleep 120

# Check container status
echo ""
echo "Container status:"
docker-compose ps

################################################################################
# Step 4: Wait for TheHive to be ready
################################################################################

echo -e "${YELLOW}[4/5] Waiting for TheHive to be ready...${NC}"

MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:9000/api/status > /dev/null 2>&1; then
        echo -e "${GREEN}✓ TheHive is ready!${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo -n "."
    sleep 10
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${RED}✗ TheHive did not start within expected time${NC}"
    echo "Check logs with: docker-compose logs thehive"
    exit 1
fi

################################################################################
# Step 5: Configure SOC Hub Integration
################################################################################

echo ""
echo -e "${YELLOW}[5/5] Configuring SOC Hub integration...${NC}"

echo ""
echo -e "${BLUE}=== Important: Manual Steps Required ===${NC}"
echo ""
echo "1. Access TheHive web interface:"
echo "   URL: http://154.26.158.31:9000"
echo "   Default credentials:"
echo "     Username: admin@thehive.local"
echo "     Password: secret"
echo ""
echo "2. Create API Key:"
echo "   a. Login to TheHive web interface"
echo "   b. Click on 'admin@thehive.local' (top right)"
echo "   c. Go to 'Create API Key'"
echo "   d. Copy the generated API key"
echo ""
echo "3. Update SOC Hub configuration:"
echo "   SSH to this server and run:"
echo ""
echo "   cd /opt/mcp/soc-hub-mcp/"
echo "   nano .env"
echo ""
echo "   Update these lines:"
echo "   THEHIVE_URL=http://154.26.158.31:9000"
echo "   THEHIVE_API_KEY=<your-api-key-from-step-2>"
echo ""
echo "   Then restart SOC Hub:"
echo "   systemctl restart soc-hub-mcp"
echo ""
echo "4. Verify integration:"
echo "   curl http://localhost:3200/api/v1/health | jq '.data.services[] | select(.service==\"thehive\")'"
echo ""
echo -e "${GREEN}=== TheHive Deployment Complete ===${NC}"
echo ""
echo "Useful commands:"
echo "  docker-compose logs -f thehive      # View logs"
echo "  docker-compose restart thehive      # Restart TheHive"
echo "  docker-compose stop                 # Stop all services"
echo "  docker-compose up -d                # Start all services"
echo ""
echo "TheHive data locations:"
echo "  Configuration: /opt/thehive/application.conf"
echo "  Docker Compose: /opt/thehive/docker-compose.yml"
echo "  Data volumes: Docker volumes (cassandra-data, thehive-data, thehive-index)"
echo ""
