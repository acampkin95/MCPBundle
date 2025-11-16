#!/bin/bash
# Environment variables template for VPN Invite System
# Copy this file to .env and fill in the values

# Database Configuration
export DB_USER="vpn_invite_user"
export DB_PASSWORD="CHANGE_ME_SECURE_PASSWORD"

# Keycloak Configuration
export KEYCLOAK_CLIENT_SECRET="CHANGE_ME_CLIENT_SECRET"

# WireGuard Configuration
export WG_SERVER_PUBLIC_KEY="CHANGE_ME_SERVER_PUBLIC_KEY"

# Session Secret (generate with: openssl rand -base64 32)
export SESSION_SECRET="CHANGE_ME_RANDOM_SESSION_SECRET"

# Instructions:
# 1. Copy this file: cp environment.sh .env
# 2. Edit .env with actual values
# 3. Source the file: source .env
# 4. Verify: echo $DB_PASSWORD

echo "Environment template loaded. Remember to update with actual values!"
