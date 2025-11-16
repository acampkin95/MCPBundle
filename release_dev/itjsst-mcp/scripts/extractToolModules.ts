/**
 * Tool Module Extraction Script
 *
 * This script automatically extracts tool registrations from the monolithic
 * registerTools.ts file and generates modular tool files.
 *
 * Usage: npx tsx scripts/extractToolModules.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface ToolExtraction {
  name: string;
  category: string;
  startLine: number;
  endLine: number;
  content: string;
}

// Tool categorization map
const toolCategories: Record<string, string> = {
  'system-overview': 'system',
  'list-launch-daemons': 'system',
  'log-review': 'system',
  'cleanup-runbook': 'system',
  'software-maintenance': 'system',

  'email-mx-lookup': 'network',
  'email-connectivity-test': 'network',
  'email-auth-check': 'network',
  'mailbox-quota-check': 'network',
  'network-inspect': 'network',
  'network-port-scan': 'network',
  'packet-capture': 'network',
  'web-performance-probe': 'network',
  'web-service-status': 'network',
  'wireless-diagnostics': 'network',
  'network-infra-diagnostics': 'network',
  'vpn-diagnostics': 'network',
  'ssh-exec': 'network',

  'scan_security_vulnerabilities': 'security',
  'firewall-diagnostics': 'security',
  'firewall-toolkit': 'security',

  'database-diagnostics': 'database',

  'windows-admin': 'admin',
  'windows-ad': 'admin',
  'windows-iis': 'admin',
  'windows-security': 'admin',
  'ubuntu-health-report': 'admin',
  'debian-health-report': 'admin',

  'mac-diagnostics': 'platform',
  'mac-permissions-audit': 'platform',
  'mac-permissions-overview': 'platform',
  'docker-desktop-status': 'platform',
  'windows-diagnostics': 'platform',
  'm365-intune-summary': 'platform',
  'panos-cli': 'platform',
  'zte-router': 'platform',

  'structured-thinking-framework': 'cognitive',
  'capture_thought': 'cognitive',
  'thought-tracker': 'cognitive',
  'thought-summary': 'cognitive',
  'thought-export': 'cognitive',
  'thought-import': 'cognitive',
  'assess-thought-quality': 'cognitive',
  'quality-trends': 'cognitive',
  'metacognitive-report': 'cognitive',
  'structured-diagnostics': 'cognitive',
  'structured-report': 'cognitive',
  'compliance-audit': 'cognitive',
  'devops-task-plan': 'cognitive',
  'playbook-preview': 'cognitive',

  'tool-metadata': 'utility',
};

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function extractTools(filePath: string): ToolExtraction[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const tools: ToolExtraction[] = [];

  let currentTool: ToolExtraction | null = null;
  let braceDepth = 0;
  let inToolRegistration = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect tool registration start
    if (line.includes('server.registerTool(')) {
      inToolRegistration = true;
      braceDepth = 0;

      // Extract tool name from next line
      const nextLine = lines[i + 1];
      const nameMatch = nextLine.match(/['"]([a-z-_]+)['"]/);
      if (nameMatch) {
        const toolName = nameMatch[1];
        const category = toolCategories[toolName] || 'unknown';

        currentTool = {
          name: toolName,
          category,
          startLine: i,
          endLine: -1,
          content: '',
        };
      }
    }

    if (inToolRegistration) {
      // Track brace depth
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      // End of registration
      if (braceDepth === 0 && line.includes(');')) {
        if (currentTool) {
          currentTool.endLine = i;
          currentTool.content = lines.slice(currentTool.startLine, i + 1).join('\n');
          tools.push(currentTool);
          currentTool = null;
        }
        inToolRegistration = false;
      }
    }
  }

  return tools;
}

function generateModuleFile(tool: ToolExtraction): string {
  const moduleName = toPascalCase(tool.name) + 'Module';

  return `/**
 * ${tool.name} Tool Module
 * Category: ${tool.category}
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ${moduleName}: ToolModule = {
  name: '${tool.name}',
  description: '${tool.name} tool',
  category: '${tool.category}',
  tools: [
    {
      name: '${tool.name}',
      description: 'See tool registration for details',
      inputSchema: {},
      category: '${tool.category}',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    ${tool.content.trim()}
  },
};
`;
}

// Main execution
const registerToolsPath = join(process.cwd(), 'src', 'tools', 'registerTools.ts');
const modulesDir = join(process.cwd(), 'src', 'tools', 'modules');

console.log('Extracting tools from registerTools.ts...');
const tools = extractTools(registerToolsPath);

console.log(`Found ${tools.length} tools`);

// Create category directories
const categories = [...new Set(tools.map(t => t.category))];
for (const category of categories) {
  const categoryDir = join(modulesDir, category);
  mkdirSync(categoryDir, { recursive: true });
}

// Generate module files
let generated = 0;
for (const tool of tools) {
  const fileName = toCamelCase(tool.name) + '.ts';
  const filePath = join(modulesDir, tool.category, fileName);
  const moduleContent = generateModuleFile(tool);

  try {
    writeFileSync(filePath, moduleContent);
    console.log(`✓ Generated ${tool.category}/${fileName}`);
    generated++;
  } catch (error) {
    console.error(`✗ Failed to generate ${tool.category}/${fileName}:`, error);
  }
}

console.log(`\nGenerated ${generated} module files`);
console.log(`Categories: ${categories.join(', ')}`);
