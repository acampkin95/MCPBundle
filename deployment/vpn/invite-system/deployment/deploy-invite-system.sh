#!/bin/bash
set -e

# VPN Invite System - Master Deployment Script
# This script deploys the complete VPN invite system

echo "========================================="
echo "VPN Invite System - Full Deployment"
echo "========================================="

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_HOST="${DEPLOY_HOST:-154.26.158.31}"
DEPLOY_USER="${DEPLOY_USER:-root}"

echo "Deployment Configuration:"
echo "  Host: $DEPLOY_HOST"
echo "  User: $DEPLOY_USER"
echo "  Project: $PROJECT_ROOT"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed"
    exit 1
fi

echo "✓ Prerequisites satisfied"

# Step 1: Setup Database
echo ""
echo "Step 1: Setting up database..."
read -p "Run database setup? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    bash "$SCRIPT_DIR/setup-database.sh"
fi

# Step 2: Setup WireGuard
echo ""
echo "Step 2: Setting up WireGuard..."
read -p "Run WireGuard setup? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    bash "$SCRIPT_DIR/setup-wireguard.sh"
fi

# Step 3: Configure Environment
echo ""
echo "Step 3: Configuring environment..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "Creating .env file from template..."
    cp "$SCRIPT_DIR/environment.sh" "$SCRIPT_DIR/.env"
    echo "✗ Please edit $SCRIPT_DIR/.env with actual values"
    echo "Then run this script again"
    exit 1
fi

source "$SCRIPT_DIR/.env"
echo "✓ Environment loaded"

# Step 4: Build Docker Images
echo ""
echo "Step 4: Building Docker images..."
cd "$PROJECT_ROOT"
docker-compose -f "$SCRIPT_DIR/docker-compose.yml" build

if [ $? -eq 0 ]; then
    echo "✓ Docker images built successfully"
else
    echo "✗ Docker build failed"
    exit 1
fi

# Step 5: Start Services
echo ""
echo "Step 5: Starting services..."
docker-compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

if [ $? -eq 0 ]; then
    echo "✓ Services started successfully"
else
    echo "✗ Failed to start services"
    exit 1
fi

# Step 6: Verify Deployment
echo ""
echo "Step 6: Verifying deployment..."
sleep 5

# Check backend
echo "Checking backend..."
if curl -s -f "http://localhost:3100/health" > /dev/null; then
    echo "✓ Backend is responding"
else
    echo "✗ Backend health check failed"
fi

# Check frontend
echo "Checking frontend..."
if curl -s -f "http://localhost:3101" > /dev/null; then
    echo "✓ Frontend is responding"
else
    echo "✗ Frontend health check failed"
fi

# Show running containers
echo ""
echo "Running containers:"
docker-compose -f "$SCRIPT_DIR/docker-compose.yml" ps

# Show logs
echo ""
echo "Recent logs:"
docker-compose -f "$SCRIPT_DIR/docker-compose.yml" logs --tail=20

echo ""
echo "========================================="
echo "Deployment complete!"
echo "========================================="
echo ""
echo "Service URLs:"
echo "  Backend:  http://$DEPLOY_HOST:3100"
echo "  Frontend: http://$DEPLOY_HOST:3101"
echo "  Health:   http://$DEPLOY_HOST:3100/health"
echo ""
echo "Management Commands:"
echo "  View logs:    docker-compose -f $SCRIPT_DIR/docker-compose.yml logs -f"
echo "  Stop:         docker-compose -f $SCRIPT_DIR/docker-compose.yml stop"
echo "  Restart:      docker-compose -f $SCRIPT_DIR/docker-compose.yml restart"
echo "  Remove:       docker-compose -f $SCRIPT_DIR/docker-compose.yml down"
echo ""
