export interface PathTraceStep {
  readonly layer: "host" | "switch" | "router" | "firewall" | "load-balancer" | "service";
  readonly device?: string;
  readonly description: string;
  readonly commands: readonly string[];
  readonly expectedResult?: string;
}

export interface PathTraceResult {
  readonly source: string;
  readonly destination: string;
  readonly steps: PathTraceStep[];
  readonly notes: string[];
}

export interface FirewallRuleSuggestion {
  readonly id: string;
  readonly severity: "low" | "medium" | "high";
  readonly finding: string;
  readonly recommendation: string;
}

export interface FirewallValidationResult {
  readonly device: string;
  readonly policyName: string;
  readonly summary: string;
  readonly rulesAnalysed: number;
  readonly suggestions: FirewallRuleSuggestion[];
}

export interface DualStackDiagnosis {
  readonly networkId: string;
  readonly checkpoints: readonly string[];
  readonly ipv4Status: string;
  readonly ipv6Status: string;
  readonly dnsFindings: readonly string[];
  readonly remediation: readonly string[];
}

export interface TopologyNode {
  readonly id: string;
  readonly type: "firewall" | "switch" | "router" | "server" | "vpn" | "dns" | "dhcp" | "other";
  readonly name: string;
  readonly metadata?: Record<string, unknown>;
}

export interface TopologyLink {
  readonly from: string;
  readonly to: string;
  readonly linkType: "ethernet" | "lag" | "vlan" | "vpn" | "wireless" | "virtual";
  readonly description?: string;
}

export interface NetworkTopology {
  readonly nodes: TopologyNode[];
  readonly links: TopologyLink[];
  readonly summary: string;
}

export interface TracePathOptions {
  readonly includeFirewallAnalysis?: boolean;
  readonly includeNatLookup?: boolean;
  readonly includeCaptureCommands?: boolean;
}

export class NetworkInfrastructureService {
  public tracePath(source: string, destination: string, options: TracePathOptions = {}): PathTraceResult {
    const steps: PathTraceStep[] = [
      {
        layer: "host",
        description: "Validate local connectivity and routing tables on the source host.",
        commands: [
          `ip addr show`,
          `ip route get ${destination}`,
          `ping -c 3 ${destination}`,
        ],
        expectedResult: "Source host has valid IP configuration and can resolve destination route.",
      },
      {
        layer: "switch",
        description: "Check VLAN trunk port status and spanning-tree state on access/aggregation switches.",
        commands: [
          "show interfaces status",
          "show spanning-tree active",
          "show vlan brief",
        ],
        expectedResult: "No err-disabled ports, VLAN trunking in sync across path.",
      },
      {
        layer: "router",
        description: "Inspect routing tables and BGP/OSPF neighbours for path stability.",
        commands: [
          "show ip route",
          "show ip bgp summary",
          "show ip ospf neighbor",
        ],
      },
    ];

    if (options.includeFirewallAnalysis) {
      steps.push({
        layer: "firewall",
        description: "Trace security policy hits and NAT translations.",
        commands: [
          "show session all filter source ...",
          "show session all filter destination ...",
          "show running security-policy",
        ],
        expectedResult: "Traffic matches expected rule without unexpected drops.",
      });
    }

    if (options.includeNatLookup) {
      steps.push({
        layer: "firewall",
        description: "Validate NAT policy and translated addresses for destination service.",
        commands: ["show running nat-policy", "show session nat all"],
      });
    }

    if (options.includeCaptureCommands) {
      steps.push({
        layer: "service",
        description: "Capture packet traces at critical points for HTTP/SSE analysis.",
        commands: ["tcpdump -i eth0 host ${destination}", "nghttp -uv ${destination}"],
      });
    }

    return {
      source,
      destination,
      steps,
      notes: [
        "Combine traceroute/mtr results with firewall session lookups for faster root cause isolation.",
        "For HTTP/SSE workloads, inspect load balancer health checks and TLS certificate status (Certbot renewals).",
      ],
    };
  }

  public validateFirewallRules(device: string, policyName: string, policy: readonly string[]): FirewallValidationResult {
    const suggestions: FirewallRuleSuggestion[] = policy.map((rule, index) => ({
      id: `${policyName}-${index + 1}`,
      severity: rule.toLowerCase().includes("any") ? "high" : "medium",
      finding: `Rule ${rule} may be overly permissive.`,
      recommendation: "Refine to specific applications, subnets, and user groups. Add logging for denied traffic.",
    }));

    return {
      device,
      policyName,
      summary: `Analysed ${policy.length} rules on ${device}. Found ${suggestions.length} improvement opportunities.`,
      rulesAnalysed: policy.length,
      suggestions,
    };
  }

  public diagnoseDualStack(networkId: string): DualStackDiagnosis {
    return {
      networkId,
      checkpoints: [
        "Verify DHCPv4 scope health and lease utilisation.",
        "Validate IPv6 RA announcements and prefix delegations.",
        "Confirm DNS AAAA/A records align and resolve over TLS.",
      ],
      ipv4Status: "Healthy",
      ipv6Status: "Investigate - observed ND cache issues",
      dnsFindings: [
        "Ensure DNS64/NAT64 translations for legacy services.",
        "Update BIND views for split-brain configurations.",
      ],
      remediation: [
        "Enable RA Guard on access switches with proper exceptions.",
        "Audit AD-integrated DNS scavenging for stale AAAA records.",
      ],
    };
  }

  public generateTopology(nodes: TopologyNode[], links: TopologyLink[]): NetworkTopology {
    const summary = `Topology comprises ${nodes.length} nodes and ${links.length} links encompassing firewalls, routing, switching, and services.`;
    return {
      nodes,
      links,
      summary,
    };
  }
}
