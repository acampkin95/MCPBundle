/**
 * compliance-audit Tool Module
 * Category: cognitive
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const ComplianceAuditModule: ToolModule = {
  name: 'compliance-audit',
  description: 'compliance-audit tool',
  category: 'cognitive',
  tools: [
    {
      name: 'compliance-audit',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'cognitive',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'compliance-audit',
    {
      description:
        'Runs Essential 8 and optional NIST compliance checks against a supplied system inventory and control set.',
      inputSchema: {
        systems: z.array(
          z.object({
            id: z.string().default(() => randomUUID()),
            name: z.string(),
            os: z.string(),
            patchLevel: z.string().optional(),
            lastPatched: z.string().optional(),
            mfaEnabled: z.boolean().optional(),
            applicationControl: z.boolean().optional(),
            hardeningBaseline: z.string().optional(),
            backupStatus: z.enum(['healthy', 'warning', 'failed']).optional(),
            loggingStatus: z.enum(['centralised', 'local-only', 'missing']).optional(),
            internetFacing: z.boolean().optional(),
          })
        ),
        controls: z
          .array(
            z.object({
              id: z.string(),
              family: z.string(),
              description: z.string(),
              implemented: z.boolean().optional(),
              evidence: z.array(z.string()).default([]),
            })
          )
          .default([]),
        framework: z.enum(['NIST CSF', 'NIST 800-53']).default('NIST CSF'),
        generateEvidence: z.boolean().default(false),
        evidenceName: z.string().optional(),
      },
    },
    async ({ systems, controls, framework, generateEvidence, evidenceName }) => {
      const essential = deps.complianceAudit.auditEssential8(systems);
      const nist = controls.length
        ? deps.complianceAudit.validateNIST(controls, framework)
        : undefined;

      let evidencePackage;
      if (generateEvidence) {
        const findings = essential.checklist
          .filter((item) => !item.compliant)
          .map((item, index) => ({
            id: `E8-${index + 1}`,
            title: item.area,
            severity: 'medium' as const,
            details: item.remediation ?? `Remediate ${item.area} gap`,
            remediation: item.remediation,
            evidence: item.evidence,
          }));
        evidencePackage = await deps.complianceAudit.generateEvidencePackage(
          findings,
          evidenceName
        );
      }

      const sections: Record<string, string> = {
        'Essential Eight score': `${essential.overallScore.toFixed(1)}%`,
        'Systems analysed': systems.length.toString(),
      };

      if (nist) {
        sections[`${framework} coverage`] = `${nist.coverage.toFixed(1)}%`;
        if (nist.gaps.length) {
          sections['NIST gaps'] = nist.gaps
            .slice(0, 5)
            .map((gap) => `${gap.controlId}: ${gap.remediation}`)
            .join('\n');
        }
      }

      if (evidencePackage) {
        sections['Evidence package'] = evidencePackage.location;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: toTextContent('Compliance Audit', sections),
          },
        ],
        structuredContent: {
          essential,
          nist,
          evidencePackage,
        },
      };
    }
  );
  },
};
