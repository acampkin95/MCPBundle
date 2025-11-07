import type { Capability } from "../config/capabilities.js";
import { logger } from "./logger.js";

export type ExecutionTarget =
  | { kind: "local" }
  | { kind: "ssh"; host: string }
  | { kind: "winrm"; host: string }
  | { kind: "agent"; agentId: string };

export interface ExecutionRouterOptions {
  readonly availableCapabilities?: Capability[];
}

export class ExecutionRouter {
  private readonly available: Set<Capability>;

  public constructor(options: ExecutionRouterOptions = {}) {
    this.available = new Set(
      options.availableCapabilities ?? ["local-shell", "local-sudo", "ssh-linux", "ssh-mac", "winrm"],
    );
  }

  public async route(capability: Capability): Promise<ExecutionTarget> {
    if (!this.available.has(capability)) {
      logger.warn("Capability not locally available", { capability });
      if (capability === "macos-wireless" || capability === "local-sudo") {
        return { kind: "agent", agentId: "auto" };
      }
      throw new Error(`Capability '${capability}' is not available on this host.`);
    }

    switch (capability) {
      case "ssh-linux":
      case "ssh-mac":
      case "local-shell":
      case "local-sudo":
      case "macos-wireless":
        return { kind: "local" };
      case "winrm":
        return { kind: "winrm", host: "remote" };
      case "agent":
        return { kind: "agent", agentId: "auto" };
      default: {
        const exhaustive: never = capability;
        throw new Error(`Unhandled capability ${exhaustive}`);
      }
    }
  }
}
