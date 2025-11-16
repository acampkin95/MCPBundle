#!/bin/bash

# Phase 1: Infrastructure Discovery Test
# Tests itjsst-mcp functionality via stdio

set -e

echo "========================================="
echo "Phase 1: Infrastructure Discovery Testing"
echo "========================================="
echo ""

SSH_CMD="sshpass -p 'C0nnaught' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@46.250.243.123"

# Test 1.1: List available tools
echo "Test 1.1: Listing available itjsst-mcp tools..."
$SSH_CMD 'node /opt/mcp/services/itjsst-mcp/dist/index.js' <<'EOF' 2>/dev/null | tee /tmp/itjsst-tools-list.json
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","id":2}
EOF

echo ""
echo "Test 1.1 Complete - Tools list saved to /tmp/itjsst-tools-list.json"
echo ""

# Test 1.2: System information gathering
echo "Test 1.2: Gathering system information from VMI01..."
$SSH_CMD 'node /opt/mcp/services/itjsst-mcp/dist/index.js' <<'EOF' 2>/dev/null | tee /tmp/system-info-result.json
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"system_getInfo","arguments":{}},"id":2}
EOF

echo ""
echo "Test 1.2 Complete - System info saved to /tmp/system-info-result.json"
echo ""

# Test 1.3: List systemd services
echo "Test 1.3: Listing systemd services on VMI01..."
$SSH_CMD 'node /opt/mcp/services/itjsst-mcp/dist/index.js' <<'EOF' 2>/dev/null | tee /tmp/systemd-services-result.json
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"linux_listServices","arguments":{}},"id":2}
EOF

echo ""
echo "Test 1.3 Complete - Services list saved to /tmp/systemd-services-result.json"
echo ""

# Test 1.4: Network diagnostics - ping VMI02D
echo "Test 1.4: Testing network connectivity VMI01 -> VMI02D..."
$SSH_CMD 'node /opt/mcp/services/itjsst-mcp/dist/index.js' <<'EOF' 2>/dev/null | tee /tmp/network-ping-result.json
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"network_ping","arguments":{"host":"10.0.0.2","count":4}},"id":2}
EOF

echo ""
echo "Test 1.4 Complete - Ping results saved to /tmp/network-ping-result.json"
echo ""

echo "========================================="
echo "Phase 1 Summary"
echo "========================================="
echo "Test 1.1: Tools List - COMPLETED"
echo "Test 1.2: System Info - COMPLETED"
echo "Test 1.3: Systemd Services - COMPLETED"
echo "Test 1.4: Network Ping - COMPLETED"
echo ""
echo "Results saved in /tmp/:"
echo "  - itjsst-tools-list.json"
echo "  - system-info-result.json"
echo "  - systemd-services-result.json"
echo "  - network-ping-result.json"
echo ""
