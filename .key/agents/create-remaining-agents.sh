#!/bin/bash
# Generate remaining 4 agents from templates

cd "/Users/alex/Projects/MCP Bundle/.key/agents"

# Copy tsconfig and service templates
for vm in vmi01 vmi02d vmi03; do
    for agent_dir in ${vm}/*-agent; do
        if [ -d "$agent_dir" ]; then
            # Copy tsconfig if not exists
            if [ ! -f "${agent_dir}/tsconfig.json" ]; then
                cp vmi01/db-optimizer-agent/tsconfig.json "${agent_dir}/"
            fi
        fi
    done
done

echo "Templates copied to all agents"
