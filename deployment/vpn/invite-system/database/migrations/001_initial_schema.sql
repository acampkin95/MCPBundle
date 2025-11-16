-- Migration: Initial Schema Setup
-- Version: 001
-- Description: Create invites and peers tables with indexes and triggers
-- Date: 2025-01-08

BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Invites table
CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(64) UNIQUE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_by_email VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_name VARCHAR(255),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired', 'revoked')),
    expires_at TIMESTAMP NOT NULL,
    claimed_at TIMESTAMP,
    claimed_by VARCHAR(255),
    claimed_from_ip VARCHAR(45),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Peers table
CREATE TABLE peers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invite_id UUID NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    public_key VARCHAR(44) UNIQUE NOT NULL,
    private_key VARCHAR(44) NOT NULL,
    preshared_key VARCHAR(64) NOT NULL,
    ip_address VARCHAR(15) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    last_handshake TIMESTAMP,
    bytes_received BIGINT DEFAULT 0,
    bytes_sent BIGINT DEFAULT 0,
    is_deployed BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_created_by ON invites(created_by);
CREATE INDEX idx_invites_status ON invites(status);
CREATE INDEX idx_invites_expires_at ON invites(expires_at);

CREATE INDEX idx_peers_invite_id ON peers(invite_id);
CREATE INDEX idx_peers_user_id ON peers(user_id);
CREATE INDEX idx_peers_public_key ON peers(public_key);
CREATE INDEX idx_peers_ip_address ON peers(ip_address);
CREATE INDEX idx_peers_status ON peers(status);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_invites_updated_at
    BEFORE UPDATE ON invites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_peers_updated_at
    BEFORE UPDATE ON peers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Audit log table
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Statistics views
CREATE VIEW invite_statistics AS
SELECT
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE status = 'claimed') AS claimed_count,
    COUNT(*) FILTER (WHERE status = 'expired') AS expired_count,
    COUNT(*) FILTER (WHERE status = 'revoked') AS revoked_count,
    COUNT(*) AS total_count,
    COUNT(DISTINCT created_by) AS unique_creators
FROM invites;

CREATE VIEW peer_statistics AS
SELECT
    COUNT(*) FILTER (WHERE status = 'active') AS active_count,
    COUNT(*) FILTER (WHERE status = 'inactive') AS inactive_count,
    COUNT(*) FILTER (WHERE status = 'revoked') AS revoked_count,
    COUNT(*) AS total_count,
    SUM(bytes_received) AS total_bytes_received,
    SUM(bytes_sent) AS total_bytes_sent
FROM peers;

COMMIT;
