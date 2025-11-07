#!/bin/bash
# Deploy Keycloak with proper configuration

set -e

cd /opt/keycloak

# Pull images first
echo "Pulling Docker images..."
docker compose pull

# Start containers
echo "Starting Keycloak containers..."
docker compose up -d

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 30

# Check container status
docker compose ps

# Show logs
echo "Recent logs:"
docker compose logs --tail=20

echo "Deployment complete!"
echo "Access Keycloak at: https://154.26.158.31:8443"