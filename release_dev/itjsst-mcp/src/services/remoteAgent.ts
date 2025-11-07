import { logger } from "../utils/logger.js";

export interface RemoteAgentTask {
  readonly tool: string;
  readonly payload: Record<string, unknown>;
  readonly capability: string;
}

export interface RemoteAgentResponse {
  readonly status: "accepted" | "rejected" | "failed";
  readonly reason?: string;
  readonly result?: Record<string, unknown>;
}

export class RemoteAgentService {
  public async dispatch(task: RemoteAgentTask): Promise<RemoteAgentResponse> {
    logger.warn("Remote agent dispatch stub invoked", { task });
    return {
      status: "rejected",
      reason: "Remote agent dispatch not yet implemented.",
    };
  }
}
