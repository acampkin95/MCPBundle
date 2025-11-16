#!/usr/bin/env bash
# Get Wazuh agent key for registration

set -euo pipefail

echo "========================================="
echo "Wazuh Agent Key Retrieval Tool"
echo "========================================="
echo

# Check for password via sshpass or environment
if command -v sshpass &> /dev/null; then
    if [ -z "${MCP_ROOT_PASSWORD:-}" ]; then
        echo "Enter root password for Wazuh Manager (154.26.158.31):"
        read -s PASSWORD
        export MCP_ROOT_PASSWORD="$PASSWORD"
    fi
    USE_SSHPASS=true
else
    if [ -z "${MCP_ROOT_PASSWORD:-}" ]; then
        echo "ERROR: MCP_ROOT_PASSWORD not set and sshpass not available"
        echo ""
        echo "Options:"
        echo "1. Pull from Contabo: npm run secrets:pull -- --out .env.secrets && source .env.secrets"
        echo "2. Set manually: export MCP_ROOT_PASSWORD=your_password"
        echo "3. Install sshpass: brew install hudochenkov/sshpass/sshpass"
        exit 1
    fi
    USE_SSHPASS=false
fi

WAZUH_MANAGER="154.26.158.31"

echo "Connecting to Wazuh Manager at $WAZUH_MANAGER..."
echo

# Function to run SSH commands
run_ssh() {
    local cmd="$1"
    if [ "$USE_SSHPASS" = true ]; then
        sshpass -p "$MCP_ROOT_PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "root@$WAZUH_MANAGER" "$cmd"
    else
        echo "$MCP_ROOT_PASSWORD" | ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "root@$WAZUH_MANAGER" "$cmd"
    fi
}

# List existing agents
echo "=== Current Wazuh Agents ==="
run_ssh '/var/ossec/bin/manage_agents -l' || echo "No agents registered yet"
echo

# Interactive menu
echo "What would you like to do?"
echo "1. Add a new agent"
echo "2. Extract key for existing agent"
echo "3. List all agents"
echo "4. Remove an agent"
echo

read -p "Enter choice (1-4): " choice

case $choice in
    1)
        read -p "Enter agent name (e.g., vmi01): " agent_name
        read -p "Enter agent IP (e.g., 46.250.243.123): " agent_ip

        echo "Adding agent..."
        run_ssh "/var/ossec/bin/manage_agents -a -n $agent_name -i $agent_ip"

        # Get the agent ID (last added)
        agent_id=$(run_ssh '/var/ossec/bin/manage_agents -l | tail -1 | cut -d" " -f4' | tr -d ',')

        echo ""
        echo "=== Agent Key ==="
        run_ssh "/var/ossec/bin/manage_agents -e $agent_id"
        echo ""
        echo "Copy the key above and use it on the agent with:"
        echo "  /var/ossec/bin/manage_agents -i <paste-key-here>"
        ;;

    2)
        read -p "Enter agent ID or name: " agent_id
        echo "=== Agent Key ==="
        run_ssh "/var/ossec/bin/manage_agents -e $agent_id"
        ;;

    3)
        echo "=== All Agents ==="
        run_ssh '/var/ossec/bin/manage_agents -l'
        ;;

    4)
        read -p "Enter agent ID to remove: " agent_id
        echo "Removing agent $agent_id..."
        run_ssh "/var/ossec/bin/manage_agents -r $agent_id"
        echo "Restarting Wazuh Manager..."
        run_ssh 'systemctl restart wazuh-manager'
        ;;

    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "========================================="
echo "Done!"
echo "========================================="
