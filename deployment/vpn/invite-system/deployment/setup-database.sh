#!/bin/bash
set -e

# VPN Invite System - Database Setup Script
# This script creates the database, user, and schema on VMI01

echo "========================================="
echo "VPN Invite System - Database Setup"
echo "========================================="

# Configuration
DB_HOST="${DB_HOST:-46.250.243.123}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-mcp_vpn_invites}"
DB_USER="${DB_USER:-vpn_invite_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

# Check if password is provided
if [ -z "$DB_PASSWORD" ]; then
    echo "Error: DB_PASSWORD not set"
    echo "Usage: DB_PASSWORD=your_password ./setup-database.sh"
    exit 1
fi

echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Check if PostgreSQL is accessible
echo "Checking PostgreSQL connection..."
if ! PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -c '\q' 2>/dev/null; then
    echo "Error: Cannot connect to PostgreSQL"
    echo "Please ensure PostgreSQL is running and accessible"
    exit 1
fi

echo "✓ PostgreSQL connection successful"

# Create database and user
echo ""
echo "Creating database and user..."
PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" <<EOF
-- Create database if not exists
SELECT 'CREATE DATABASE $DB_NAME'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo "✓ Database and user created"

# Run schema migration
echo ""
echo "Running schema migration..."
PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < ../database/schema.sql

if [ $? -eq 0 ]; then
    echo "✓ Schema migration completed successfully"
else
    echo "✗ Schema migration failed"
    exit 1
fi

# Verify tables
echo ""
echo "Verifying database schema..."
TABLE_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

echo "Tables created: $TABLE_COUNT"

if [ "$TABLE_COUNT" -ge 3 ]; then
    echo "✓ Database setup completed successfully"
    echo ""
    echo "Database ready at: postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
else
    echo "✗ Warning: Expected at least 3 tables, found $TABLE_COUNT"
    exit 1
fi

# Optional: Load seed data
read -p "Load test seed data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Loading seed data..."
    PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < ../database/seed.sql
    echo "✓ Seed data loaded"
fi

echo ""
echo "========================================="
echo "Database setup complete!"
echo "========================================="
