export type FirewallVendor =
  | 'palo-alto'
  | 'cisco-asa'
  | 'fortinet'
  | 'checkpoint'
  | 'pfsense'
  | 'pan-os';
export type TroubleshootingScenario =
  | 'connectivity'
  | 'performance'
  | 'vpn'
  | 'high-availability'
  | 'threat';

export interface TroubleshootingOptions {
  readonly vendor: FirewallVendor;
  readonly scenario: TroubleshootingScenario;
  readonly context?: string;
}

export interface TroubleshootingStep {
  readonly title: string;
  readonly description: string;
  readonly commands: readonly string[];
}

export interface TroubleshootingPlaybook {
  readonly vendor: FirewallVendor;
  readonly scenario: TroubleshootingScenario;
  readonly summary: string;
  readonly preChecks: readonly TroubleshootingStep[];
  readonly diagnosticCommands: readonly TroubleshootingStep[];
  readonly remediationHints: readonly string[];
}

const VENDOR_COMMANDS: Record<
  FirewallVendor,
  Record<TroubleshootingScenario, TroubleshootingPlaybook>
> = {
  'palo-alto': buildPanOsPlaybooks('palo-alto'),
  'pan-os': buildPanOsPlaybooks('pan-os'),
  'cisco-asa': buildCiscoAsaPlaybooks(),
  fortinet: buildFortinetPlaybooks(),
  checkpoint: buildCheckpointPlaybooks(),
  pfsense: buildPfsensePlaybooks(),
};

function buildPanOsPlaybooks(
  vendor: FirewallVendor
): Record<TroubleshootingScenario, TroubleshootingPlaybook> {
  return {
    connectivity: {
      vendor,
      scenario: 'connectivity',
      summary:
        'Validate dataplane session state, route lookups, and policy hits for the affected traffic.',
      preChecks: [
        {
          title: 'Control plane health',
          description:
            'Ensure the management plane and dataplane are operational before troubleshooting traffic.',
          commands: [
            'show system info',
            'show system statistics session',
            'show system software status',
          ],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Session & policy lookups',
          description:
            'Trace sessions matching the source/destination pair and confirm policy hit counters.',
          commands: [
            'show session all filter source <src-ip> destination <dst-ip>',
            'test security-policy-match from <zone> to <zone> source <src-ip> destination <dst-ip> protocol <proto> port <port>',
            'show running security-policy',
          ],
        },
        {
          title: 'Routing and ARP',
          description: 'Confirm the route table and ARP entries resolve the destination correctly.',
          commands: ['show routing route destination <dst-ip>', 'show arp entry <dst-ip>'],
        },
      ],
      remediationHints: [
        'Check security policy order – more specific rules should precede broad any/any rules.',
        'Validate NAT rules for overlapping translated addresses and service objects.',
        'Review threat logs for resets that may indicate upstream inspection blocks.',
      ],
    },
    performance: {
      vendor,
      scenario: 'performance',
      summary:
        'Analyse dataplane CPU, concurrent sessions, and global counters for drops/bottlenecks.',
      preChecks: [
        {
          title: 'Dataplane utilisation',
          description: 'Inspect dataplane CPU and session utilisation to determine load trends.',
          commands: ['show running resource-monitor', 'show session info'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Global counters',
          description: 'Identify packet drops or resource exhaustion using global counters.',
          commands: [
            'show counter global filter delta yes severity drop',
            'show log system direction equal backward count 10',
          ],
        },
        {
          title: 'Data-plane packet capture',
          description:
            'Target a specific flow or application for capture to isolate latency causes.',
          commands: [
            'debug dataplane packet-diag set filter match destination <dst-ip>',
            'debug dataplane packet-diag set capture stage receive file pcaps/receive.pcap',
            'debug dataplane packet-diag set capture stage transmit file pcaps/transmit.pcap',
          ],
        },
      ],
      remediationHints: [
        'Enable APP-ID and content updates during maintenance windows to ensure accurate identification.',
        'Consider session offload tuning (session-offload, SYN cookies) if CPU remains high.',
        'Use QoS or traffic shaping for chatty applications traversing low-bandwidth links.',
      ],
    },
    vpn: {
      vendor,
      scenario: 'vpn',
      summary:
        'Validate IKE/IPSec status, tunnel monitor reachability, and route injection for GlobalProtect/IPSec tunnels.',
      preChecks: [
        {
          title: 'IKE Gateway status',
          description: 'Ensure phase1/phase2 are negotiated and proposal matches.',
          commands: ['show vpn ike-sa', 'show vpn ipsec-sa'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Tunnel monitors',
          description: 'Check tunnel monitor targets and failover behaviour.',
          commands: ['show vpn flow', 'show global-protect-gateway session-info'],
        },
        {
          title: 'Routing decisions',
          description:
            'Confirm traffic destined for protected networks is routed to the tunnel interface.',
          commands: [
            'show routing route destination <protected-prefix>',
            'show session all filter egress <tunnel-interface>',
          ],
        },
      ],
      remediationHints: [
        'Ensure both peers share identical crypto profiles and lifetimes.',
        'Verify tunnel interface is added to the correct virtual router and security zones.',
        'Monitor for fragmentation (DF bit) on low MTU circuits; adjust MSS if necessary.',
      ],
    },
    'high-availability': {
      vendor,
      scenario: 'high-availability',
      summary: 'Audit HA pair synchronisation, link health, and preemption behaviour.',
      preChecks: [
        {
          title: 'HA link state',
          description: 'Confirm control and data link status and election timers.',
          commands: ['show high-availability state', 'show high-availability link-monitoring'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Config synchronisation',
          description: 'Validate configuration sync and last commit across HA peers.',
          commands: [
            'show high-availability state-synchronization',
            'show jobs processed | match Commit',
          ],
        },
      ],
      remediationHints: [
        'Ensure peer IP reachability on HA1/HA2 links and jumbo frame consistency.',
        'Disable preemption during maintenance to avoid unnecessary failovers.',
        'Review HA timers if failover triggers due to brief link flaps.',
      ],
    },
    threat: {
      vendor,
      scenario: 'threat',
      summary:
        'Correlate threat logs, wildfire submissions, and security profiles to mitigate active attacks.',
      preChecks: [
        {
          title: 'Threat log overview',
          description: 'Review recent threat events for impacted zones/users.',
          commands: [
            'show log threat direction equal backward count 20',
            'show log wildfire direction equal backward count 20',
          ],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Profile configuration',
          description: 'Check security profiles applied to policies handling affected traffic.',
          commands: ['show profiles security', 'show running security-policy | match profile'],
        },
      ],
      remediationHints: [
        'Enable DNS sinkhole and URL filtering for better detection of callback domains.',
        'Consider blocking high-risk applications or enforce SSL decryption for inspection.',
        'Review IOC feeds and adjust custom signatures as required.',
      ],
    },
  };
}

function buildCiscoAsaPlaybooks(): Record<TroubleshootingScenario, TroubleshootingPlaybook> {
  return {
    connectivity: {
      vendor: 'cisco-asa',
      scenario: 'connectivity',
      summary: 'Validate connection tables, ACL hits, and NAT translations.',
      preChecks: [
        {
          title: 'Device health',
          description: 'Inspect CPU/memory and interface status before troubleshooting flows.',
          commands: ['show cpu usage', 'show memory', 'show interface ip brief'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Connection table',
          description: 'Trace flows and confirm security hitcounts.',
          commands: [
            'show conn address <ip>',
            'show access-list <acl-name> | include <ip>',
            'packet-tracer input <int> tcp <src-ip> <port> <dst-ip> <port>',
          ],
        },
      ],
      remediationHints: [
        'Ensure unified ACL object-groups are updated across contexts.',
        'Audit twice NAT order when migrating policies from legacy rulebases.',
        'Enable logging classically (logging enable + buffered debugging) for transient issues.',
      ],
    },
    performance: {
      vendor: 'cisco-asa',
      scenario: 'performance',
      summary: 'Check dataplane drops, CPU spikes, and inspect policy optimisation.',
      preChecks: [
        {
          title: 'Resource usage',
          description: 'Monitor CPU utilisation and connection count.',
          commands: ['show processes cpu-usage non-zero', 'show conn count'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'ASP drops',
          description: 'Identify accelerated security path drops and reasons.',
          commands: ['show asp drop', 'show interface <int> | include drops'],
        },
      ],
      remediationHints: [
        'Enable flow offload and inspect fail-open policies for CPU relief.',
        'Verify smart licensing for FirePOWER modules to avoid QoS penalties.',
        'Consider splitting traffic across contexts or clustering.',
      ],
    },
    vpn: vpnTemplate(
      'cisco-asa',
      ['show vpn-sessiondb summary', 'show crypto isakmp sa'],
      [
        'Confirm crypto ACLs mirror remote peer networks and object-groups.',
        'Verify tunnel-group shared secrets and ISAKMP policies match.',
      ],
      ['show crypto ipsec sa']
    ),
    'high-availability': {
      vendor: 'cisco-asa',
      scenario: 'high-availability',
      summary: 'Check failover pair health and stateful sync.',
      preChecks: [
        {
          title: 'Failover status',
          description: 'Review failover health and last state transitions.',
          commands: ['show failover', 'show failover history'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'State sync',
          description: 'Ensure stateful failover is operational and session tables align.',
          commands: ['show failover state', 'show conn count'],
        },
      ],
      remediationHints: [
        'Confirm failover link speed and duplex alignment.',
        'Synchronise licensing and code version between peers.',
        'Avoid configuration changes on standby units outside change control.',
      ],
    },
    threat: threatTemplate(
      'cisco-asa',
      ['show asp drop', 'show logging'],
      [
        'Enable FirePOWER module inspection and correlation.',
        'Review dynamic access policies for remote-access VPN users.',
      ]
    ),
  };
}

function buildFortinetPlaybooks(): Record<TroubleshootingScenario, TroubleshootingPlaybook> {
  return {
    connectivity: {
      vendor: 'fortinet',
      scenario: 'connectivity',
      summary: 'Use diagnose commands to inspect sessions, policies, and routes.',
      preChecks: [
        {
          title: 'System health',
          description: 'Ensure CPU, memory, and HA status are nominal.',
          commands: ['get system performance status', 'get system ha status'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Session & policy',
          description: 'Trace flows and policy hits.',
          commands: [
            'diagnose sys session list | grep <ip>',
            'diagnose firewall iprope lookup <proto> <src> <dst>',
          ],
        },
      ],
      remediationHints: [
        'Check central SNAT policy when using VIPs and load balancers.',
        'Review policy sequence vs. service/application matching.',
      ],
    },
    performance: {
      vendor: 'fortinet',
      scenario: 'performance',
      summary: 'Inspect dataplane and NPU utilisation using diagnose hardware commands.',
      preChecks: [
        {
          title: 'Resource snapshot',
          description: 'Collect CPU/memory baseline.',
          commands: ['diagnose hardware sysinfo memory', 'diagnose hardware sysinfo cpu'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'NPU stats',
          description: 'Check sessions offloaded to NPUs and drop counters.',
          commands: ['diagnose npu np6 stats', 'diagnose hardware deviceinfo nic'],
        },
      ],
      remediationHints: [
        'Balance sessions across VDOMs and enable asym route support where required.',
        'Adjust IPS/AV profiles for high-throughput services.',
      ],
    },
    vpn: vpnTemplate(
      'fortinet',
      ['diagnose vpn ike gateway list', 'diagnose vpn tunnel list'],
      [
        'Ensure phase1/phase2 selectors match remote end.',
        'Tune DPD/rekey timers for satellite links.',
      ]
    ),
    'high-availability': {
      vendor: 'fortinet',
      scenario: 'high-availability',
      summary: 'Check HA state and synchronization status.',
      preChecks: [
        {
          title: 'HA health',
          description: 'Inspect HA cluster state and link status.',
          commands: ['get system ha status', 'diagnose sys ha status'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Config sync',
          description: 'Ensure override priority and sync status align.',
          commands: ['diagnose sys ha checksum'],
        },
      ],
      remediationHints: [
        'Match firmware and VDOM configurations across nodes.',
        'Avoid interface flaps by ensuring link speed/duplex alignment.',
      ],
    },
    threat: threatTemplate(
      'fortinet',
      ['diagnose log display', 'diagnose ips anomaly list'],
      [
        'Leverage FortiAnalyzer for deeper log correlation.',
        'Upgrade IPS engine and AV signatures during maintenance windows.',
      ]
    ),
  };
}

function buildCheckpointPlaybooks(): Record<TroubleshootingScenario, TroubleshootingPlaybook> {
  return {
    connectivity: {
      vendor: 'checkpoint',
      scenario: 'connectivity',
      summary: 'Focus on fw monitor, cpview, and policy verification.',
      preChecks: [
        {
          title: 'System baseline',
          description: 'Capture performance metrics via cpview.',
          commands: ['cpview'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'fw monitor',
          description: 'Trace packets through inspection points.',
          commands: ["fw monitor -e 'accept host(<src>,<dst>) and accept;'"],
        },
      ],
      remediationHints: [
        'Reinstall policy if changes did not apply on gateways.',
        'Check implicit cleanup rule hits via SmartConsole.',
      ],
    },
    performance: {
      vendor: 'checkpoint',
      scenario: 'performance',
      summary: 'Use cpview and cpstat to identify resource pressure.',
      preChecks: [
        {
          title: 'CPU MultiQueue',
          description: 'Ensure SND/IRQ distribution is balanced.',
          commands: ['cpstat os -f multik'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'CoreXL',
          description: 'Check distribution of CoreXL instances.',
          commands: ['fw ctl multik stat'],
        },
      ],
      remediationHints: [
        'Tune SecureXL templates and consider enabling HyperFlow.',
        'Upgrade hardware blades based on throughput requirements.',
      ],
    },
    vpn: vpnTemplate(
      'checkpoint',
      ['vpn tu tnr', 'vpn tu tnd'],
      [
        'Verify tunnel community settings and shared secrets.',
        'Inspect ike.elg for negotiation failures.',
      ]
    ),
    'high-availability': {
      vendor: 'checkpoint',
      scenario: 'high-availability',
      summary: 'Analyse clusterXL status and member health.',
      preChecks: [
        {
          title: 'ClusterXL',
          description: 'Check cluster state and sync interfaces.',
          commands: ['cphaprob state', 'cphaprob -a if'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Policy sync',
          description: 'Validate policy install and table sync.',
          commands: ['cphaprob list', 'fw tab -t connections -s'],
        },
      ],
      remediationHints: [
        'Ensure state synchronization network is isolated and low latency.',
        'Match jumbo hotfix levels across cluster members.',
      ],
    },
    threat: threatTemplate(
      'checkpoint',
      ['cpview -t threat'],
      [
        'Inspect SmartEvent for incident correlation.',
        'Update IPS protections and threat-emulation images.',
      ],
      ['fw log', 'cpca_client lscert']
    ),
  };
}

function buildPfsensePlaybooks(): Record<TroubleshootingScenario, TroubleshootingPlaybook> {
  return {
    connectivity: {
      vendor: 'pfsense',
      scenario: 'connectivity',
      summary: 'Utilise pftop and packet capture for quick triage.',
      preChecks: [
        {
          title: 'System dashboard',
          description: 'Review CPU/memory and gateway status.',
          commands: ['pfctl -s info', 'pfctl -s memory'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Filter states',
          description: 'Inspect state table and rule counters.',
          commands: ['pfctl -s state | grep <ip>', 'pfctl -s rules'],
        },
      ],
      remediationHints: [
        'Confirm floating rules order and interface bindings.',
        'Check outbound NAT mappings if traffic is asymmetric.',
      ],
    },
    performance: {
      vendor: 'pfsense',
      scenario: 'performance',
      summary: 'Monitor queues and high availability interface counters.',
      preChecks: [
        {
          title: 'Queue status',
          description: 'Ensure traffic shaping queues healthy.',
          commands: ['pfctl -vvs queue'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'Packet capture',
          description: 'Capture suspect traffic with tcpdump.',
          commands: ['tcpdump -ni <interface> host <ip>'],
        },
      ],
      remediationHints: [
        'Review gateway monitoring thresholds for WAN failovers.',
        'Adjust state table size for high connection count workloads.',
      ],
    },
    vpn: vpnTemplate(
      'pfsense',
      ['swanctl --list-sas'],
      ['Validate Phase1/Phase2 proposals in IPsec tunnels.', 'Review OpenVPN status via clid'],
      ['openvpn-status']
    ),
    'high-availability': {
      vendor: 'pfsense',
      scenario: 'high-availability',
      summary: 'Check CARP status and XMLRPC sync health.',
      preChecks: [
        {
          title: 'CARP overview',
          description: 'Ensure virtual IPs master/backup status expected.',
          commands: ['ifconfig | grep carp', 'pfctl -s state | grep -i carp'],
        },
      ],
      diagnosticCommands: [
        {
          title: 'XMLRPC sync',
          description: 'Check config sync messages on secondary.',
          commands: ['clog /var/log/system.log | grep xmlrpc'],
        },
      ],
      remediationHints: [
        'Match VHID priorities and skew to control failover order.',
        'Ensure sync interface MTU matches across nodes.',
      ],
    },
    threat: threatTemplate(
      'pfsense',
      ['pfctl -s info'],
      [
        'Leverage Suricata/Zeek packages for deeper inspection.',
        'Update geoip/databases regularly.',
      ],
      ['clog /var/log/filter.log']
    ),
  };
}

function vpnTemplate(
  vendor: FirewallVendor,
  commands: string[],
  hints: string[],
  extraCommands: string[] = []
): TroubleshootingPlaybook {
  return {
    vendor,
    scenario: 'vpn',
    summary:
      'Review tunnel negotiation, route injection, and monitoring for remote access/site-to-site VPNs.',
    preChecks: [
      {
        title: 'VPN status',
        description: 'Confirm tunnel negotiation status and recent failures.',
        commands,
      },
    ],
    diagnosticCommands: extraCommands.length
      ? [
          {
            title: 'Additional diagnostics',
            description: 'Run targeted commands based on VPN technology.',
            commands: extraCommands,
          },
        ]
      : [],
    remediationHints: hints,
  };
}

function threatTemplate(
  vendor: FirewallVendor,
  commands: string[],
  hints: string[],
  extraCommands: string[] = []
): TroubleshootingPlaybook {
  return {
    vendor,
    scenario: 'threat',
    summary:
      'Investigate threat logs, signatures, and policy enforcement to mitigate ongoing incidents.',
    preChecks: [
      {
        title: 'Threat overview',
        description: 'Review latest threat events and signatures.',
        commands,
      },
    ],
    diagnosticCommands: extraCommands.length
      ? [
          {
            title: 'Deep inspection',
            description: 'Run additional commands for log review and signature management.',
            commands: extraCommands,
          },
        ]
      : [],
    remediationHints: hints,
  };
}

export class FirewallToolkitService {
  public generatePlaybook(options: TroubleshootingOptions): TroubleshootingPlaybook {
    const vendorMap = VENDOR_COMMANDS[options.vendor];
    if (!vendorMap) {
      throw new Error(`Unsupported vendor: ${options.vendor}`);
    }

    const playbook = vendorMap[options.scenario];
    if (!playbook) {
      throw new Error(`Scenario '${options.scenario}' not defined for vendor ${options.vendor}.`);
    }

    if (options.context) {
      return {
        ...playbook,
        summary: `${playbook.summary} Context: ${options.context}`,
      };
    }
    return playbook;
  }
}
