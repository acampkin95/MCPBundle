import { CommandRunner } from '../utils/commandRunner.js';

export class SoftwareService {
  public constructor(private readonly runner: CommandRunner) {}

  public async listBrewOutdated() {
    return this.runner.run('brew outdated --verbose');
  }

  public async cleanupBrew() {
    return this.runner.run('brew cleanup', { requiresSudo: false });
  }

  public async listApplicationsSortedBySize() {
    const command = 'du -sh /Applications/* | sort -h';
    return this.runner.run(command);
  }

  public async listLoginItems() {
    const command =
      'osascript -e \'tell application "System Events" to get the name of every login item\'';
    return this.runner.run(command);
  }
}
