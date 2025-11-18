#!/bin/bash

PASSWORD='${KEYCLOAK_ADMIN_PASSWORD:?Error: KEYCLOAK_ADMIN_PASSWORD environment variable not set}'

TOKEN=$(curl -s -X POST "http://154.26.158.31:8080/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin" \
    -d "password=${PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" | jq -r '.access_token')

echo "Token: ${TOKEN:0:50}..."

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
    echo "Authentication successful"

    # Try to create the realm
    RESPONSE=$(curl -s -X POST "http://154.26.158.31:8080/admin/realms" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
          "realm": "mcp-ecosystem",
          "enabled": true,
          "sslRequired": "external",
          "registrationAllowed": false,
          "loginWithEmailAllowed": true,
          "duplicateEmailsAllowed": false,
          "resetPasswordAllowed": true,
          "bruteForceProtected": true
        }')

    echo "Create realm response: $RESPONSE"
else
    echo "Authentication failed"
fi