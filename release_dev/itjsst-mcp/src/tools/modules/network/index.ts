/**
 * Network Tools Module Index
 *
 * Aggregates all network diagnostic and monitoring tools
 */

import type { ToolModule } from '../types.js';
import { EmailMxLookupModule } from './emailMxLookup.js';
import { EmailConnectivityTestModule } from './emailConnectivityTest.js';
import { EmailAuthCheckModule } from './emailAuthCheck.js';
import { MailboxQuotaCheckModule } from './mailboxQuotaCheck.js';
import { NetworkInspectModule } from './networkInspect.js';
import { NetworkPortScanModule } from './networkPortScan.js';
import { PacketCaptureModule } from './packetCapture.js';
import { WebPerformanceProbeModule } from './webPerformanceProbe.js';
import { WebServiceStatusModule } from './webServiceStatus.js';
import { WirelessDiagnosticsModule } from './wirelessDiagnostics.js';
import { NetworkInfraDiagnosticsModule } from './networkInfraDiagnostics.js';
import { VpnDiagnosticsModule } from './vpnDiagnostics.js';
import { SshExecModule } from './sshExec.js';

/**
 * All network tool modules
 */
export const networkModules: readonly ToolModule[] = [
  EmailMxLookupModule,
  EmailConnectivityTestModule,
  EmailAuthCheckModule,
  MailboxQuotaCheckModule,
  NetworkInspectModule,
  NetworkPortScanModule,
  PacketCaptureModule,
  WebPerformanceProbeModule,
  WebServiceStatusModule,
  WirelessDiagnosticsModule,
  NetworkInfraDiagnosticsModule,
  VpnDiagnosticsModule,
  SshExecModule,
] as const;

/**
 * Network tools category summary
 */
export const networkToolsSummary = {
  category: 'network' as const,
  moduleCount: networkModules.length,
  tools: networkModules.flatMap((m) => m.tools),
  description: 'Network diagnostic, monitoring, and connectivity tools',
} as const;
