import type { CommandRunner } from '../utils/commandRunner.js';
import { UbuntuAdminService } from './ubuntuAdmin.js';

/**
 * Debian-focused administration service. Reuses the Ubuntu command runners while
 * exposing the same high-level interface so tools can target either distribution.
 */
export class DebianAdminService extends UbuntuAdminService {
  public constructor(runner: CommandRunner) {
    super(runner);
  }
}
