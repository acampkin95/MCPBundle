import { CommandRunner } from "../utils/commandRunner.js";

export class NetworkService {
  public constructor(private readonly runner: CommandRunner) {}

  public async listActiveConnections() {
    return this.runner.run("netstat -anv");
  }

  public async listListeningSockets() {
    return this.runner.run("lsof -iTCP -sTCP:LISTEN -Pn");
  }

  public async analyzeFirewall() {
    return this.runner.run(
      "/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate",
      { requiresSudo: true },
    );
  }

  public async scanWirelessNetworks() {
    const command =
      "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s";
    return this.runner.run(command, { requiresSudo: true });
  }

  public async sampleBandwidth(seconds = 10) {
    const duration = Math.max(1, seconds);
    return this.runner.run(`nettop -P -L 1 -x -J bytes_in,bytes_out -t wifi -n -l ${duration}`);
  }
}
