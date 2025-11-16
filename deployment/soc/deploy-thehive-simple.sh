#!/bin/bash

# TheHive Simple Deployment - No External Elasticsearch Required
# This uses Cassandra's built-in indexing instead of external Elasticsearch
# Simpler, more reliable, easier to deploy

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

THEHIVE_DIR="/opt/thehive"

log_info "TheHive Simple Deployment Starting..."

# Stop existing containers
log_info "Stopping existing TheHive containers..."
cd "$THEHIVE_DIR" || exit 1
docker-compose down || true

# Create simplified application.conf (no external Elasticsearch)
log_info "Creating simplified application configuration..."
cat > "$THEHIVE_DIR/application.conf" << 'EOF'
# TheHive Configuration - Simplified without external search index
# Uses Cassandra's built-in indexing for simplicity and reliability

play.http.secret.key="0e32fe7060592b9122c8b487219779c6b3c7597c9b70c64003d5fad9a4665f07"

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

    # No external search index - use Cassandra's built-in indexing
    # This is simpler and avoids network connectivity issues
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

# HTTP server configuration
play.server.http.port = 9000
play.server.http.address = "0.0.0.0"

# Akka configuration
akka {
  actor {
    default-dispatcher {
      fork-join-executor {
        parallelism-min = 2
        parallelism-factor = 2.0
        parallelism-max = 4
      }
    }
  }
}
EOF

log_success "Configuration file created at $THEHIVE_DIR/application.conf"

# Create simplified docker-compose.yml (no extra_hosts needed)
log_info "Creating simplified Docker Compose configuration..."
cat > "$THEHIVE_DIR/docker-compose.yml" << 'EOF'
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
    healthcheck:
      test: ["CMD-SHELL", "nodetool status"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  thehive:
    image: strangebee/thehive:5.2
    container_name: thehive
    restart: unless-stopped
    depends_on:
      cassandra:
        condition: service_healthy
    ports:
      - "9000:9000"
    environment:
      - JVM_OPTS=-Xms1G -Xmx1G
    volumes:
      - thehive-data:/opt/thp/thehive/data
      - thehive-index:/opt/thp/thehive/index
      - ./application.conf:/etc/thehive/application.conf:ro
    networks:
      - thehive-net
    command:
      - --secret
      - "0e32fe7060592b9122c8b487219779c6b3c7597c9b70c64003d5fad9a4665f07"

volumes:
  cassandra-data:
  thehive-data:
  thehive-index:

networks:
  thehive-net:
    driver: bridge
EOF

log_success "Docker Compose file created"

# Start containers
log_info "Starting TheHive containers..."
docker-compose up -d

# Wait for Cassandra to be ready
log_info "Waiting for Cassandra to be healthy (this may take 60-90 seconds)..."
for i in {1..30}; do
    if docker exec thehive-cassandra nodetool status 2>/dev/null | grep -q "UN"; then
        log_success "Cassandra is ready"
        break
    fi
    echo -n "."
    sleep 3
done
echo ""

# Wait for TheHive to start
log_info "Waiting for TheHive to start (this may take 30-60 seconds)..."
sleep 10

# Check container status
log_info "Checking container status..."
docker ps -a --filter "name=thehive" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check TheHive logs
log_info "Recent TheHive logs:"
docker logs thehive --tail 50 2>&1 | tail -20

# Test TheHive API
log_info "Testing TheHive API..."
sleep 5
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/api/status | grep -q "200\|401"; then
    log_success "TheHive API is responding!"
else
    log_warning "TheHive API not yet ready, may need more time to initialize"
fi

# Display connection info
log_success "============================================"
log_success "TheHive Simple Deployment Complete!"
log_success "============================================"
echo ""
log_info "Configuration:"
echo "  - Using Cassandra built-in indexing (no external Elasticsearch)"
echo "  - Simpler architecture, fewer moving parts"
echo "  - More reliable networking"
echo ""
log_info "Access URLs:"
echo "  - TheHive UI:  http://154.26.158.31:9000"
echo "  - TheHive API: http://154.26.158.31:9000/api"
echo ""
log_info "Default Credentials (first login):"
echo "  - Username: admin@thehive.local"
echo "  - Password: secret"
echo "  - IMPORTANT: Change password immediately after first login!"
echo ""
log_info "Container Management:"
echo "  - View logs:     docker logs -f thehive"
echo "  - Restart:       docker-compose restart"
echo "  - Stop:          docker-compose down"
echo "  - Start:         docker-compose up -d"
echo ""
log_info "Health Checks:"
echo "  - Container status: docker ps -a | grep thehive"
echo "  - API status:       curl http://localhost:9000/api/status"
echo "  - Cassandra status: docker exec thehive-cassandra nodetool status"
echo ""

# Save deployment info
cat > "$THEHIVE_DIR/DEPLOYMENT_INFO.txt" << EOF
TheHive Simple Deployment
=========================
Deployed: $(date)
Configuration: Simplified (Cassandra built-in indexing)

Architecture:
- TheHive 5.2 (Container)
- Cassandra 4.1 (Container)
- No external Elasticsearch (simplified)

URLs:
- UI:  http://154.26.158.31:9000
- API: http://154.26.158.31:9000/api

Default Credentials:
- Username: admin@thehive.local
- Password: secret
- CHANGE PASSWORD IMMEDIATELY!

Files:
- Config: /opt/thehive/application.conf
- Docker: /opt/thehive/docker-compose.yml
- Data:   Docker volumes (cassandra-data, thehive-data, thehive-index)

Commands:
- Logs:    docker logs -f thehive
- Restart: cd /opt/thehive && docker-compose restart
- Status:  curl http://localhost:9000/api/status
EOF

log_success "Deployment info saved to $THEHIVE_DIR/DEPLOYMENT_INFO.txt"
log_success "TheHive Simple Deployment Complete!"
