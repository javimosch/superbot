/**
 * Shell execution tool with safety guards
 */
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { Tool } from './base.js';

const execAsync = promisify(execCallback);

// Dangerous patterns to block
const DENY_PATTERNS = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\bdel\s+\/[fq]\b/i,
  /\brmdir\s+\/s\b/i,
  /\b(format|mkfs|diskpart)\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd/i,
  /\b(shutdown|reboot|poweroff)\b/i,
  /:\(\)\s*\{.*\};\s*:/
];

export class ExecTool extends Tool {
  /**
   * @param {object} options
   * @param {string} [options.workingDir] - Default working directory
   * @param {number} [options.timeout=60] - Timeout in seconds
   * @param {boolean} [options.restrictToWorkspace=false] - Restrict paths to workspace
   */
  constructor({ workingDir, timeout = 60, restrictToWorkspace = false } = {}) {
    super();
    this.workingDir = workingDir;
    this.timeout = timeout;
    this.restrictToWorkspace = restrictToWorkspace;
  }

  get name() { return 'exec'; }
  get description() { return 'Execute a shell command and return its output. Use with caution.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        working_dir: { type: 'string', description: 'Optional working directory' }
      },
      required: ['command']
    };
  }

  async execute({ command, working_dir }) {
    const cwd = working_dir || this.workingDir || process.cwd();
    const guardError = this._guardCommand(command, cwd);
    if (guardError) return guardError;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: this.timeout * 1000,
        maxBuffer: 10 * 1024 * 1024
      });

      const parts = [];
      if (stdout) parts.push(stdout);
      if (stderr && stderr.trim()) parts.push(`STDERR:\n${stderr}`);

      let result = parts.length > 0 ? parts.join('\n') : '(no output)';
      const maxLen = 10000;
      if (result.length > maxLen) {
        result = result.slice(0, maxLen) + `\n... (truncated, ${result.length - maxLen} more chars)`;
      }
      return result;
    } catch (err) {
      if (err.killed) {
        return `Error: Command timed out after ${this.timeout} seconds`;
      }
      const parts = [];
      if (err.stdout) parts.push(err.stdout);
      if (err.stderr) parts.push(`STDERR:\n${err.stderr}`);
      parts.push(`\nExit code: ${err.code || 'unknown'}`);
      return parts.join('\n') || `Error executing command: ${err.message}`;
    }
  }

  _guardCommand(command, cwd) {
    const cmd = command.trim();
    const lower = cmd.toLowerCase();

    for (const pattern of DENY_PATTERNS) {
      if (pattern.test(lower)) {
        return 'Error: Command blocked by safety guard (dangerous pattern detected)';
      }
    }

    if (this.restrictToWorkspace) {
      if (cmd.includes('..\\') || cmd.includes('../')) {
        return 'Error: Command blocked by safety guard (path traversal detected)';
      }
      const cwdPath = resolve(cwd);
      const pathMatches = [...cmd.matchAll(/[A-Za-z]:\\[^\s"']+|\/[^\s"']+/g)];
      for (const match of pathMatches) {
        try {
          const p = resolve(match[0]);
          if (!p.startsWith(cwdPath)) {
            return 'Error: Command blocked by safety guard (path outside working dir)';
          }
        } catch { /* ignore */ }
      }
    }

    return null;
  }
}
