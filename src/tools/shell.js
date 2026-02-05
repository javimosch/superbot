/**
 * Shell execution tool with safety guards
 */
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { resolve, sep } from 'path';
import { realpath } from 'fs/promises';
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

// Additional bypass patterns to block
const BYPASS_PATTERNS = [
  /\$\{[^}]*\}\/\.\./,  // ${VAR}/../
  /\$[A-Za-z_][A-Za-z0-9_]*\/\.\./,  // $VAR/../
  /\$\([^)]*\)\/\.\./,  // $(cmd)/../
  /~\/\.\./,  // ~/../
];

/**
 * Extract all paths from a command
 * @param {string} command - Command to analyze
 * @returns {string[]} Array of detected paths
 */
function extractAllPaths(command) {
  const paths = new Set();
  
  // Absolute paths starting with / (Unix)
  // Match: /path, /path/to/file (but not ./path)
  const absolutePaths = [...command.matchAll(/(?:^|\s)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*/g)];
  absolutePaths.forEach(match => paths.add(match[0].trim()));
  
  // Windows paths: C:\path\to\file
  const windowsPaths = [...command.matchAll(/[A-Za-z]:\\[^\s"']+/g)];
  windowsPaths.forEach(match => paths.add(match[0]));
  
  // Quoted paths: "path", 'path' - extract the content
  const quotedPaths = [...command.matchAll(/["']([^"']+)["']/g)];
  quotedPaths.forEach(match => {
    const content = match[1];
    // Only add if it looks like a path
    if (content.includes('/') || content.includes('\\') || content.includes('..') || content.startsWith('~') || content.startsWith('$')) {
      paths.add(content);
    }
  });
  
  // Environment variables: $VAR/path, ${VAR}/path
  const envPaths = [...command.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\/[^\s]*/g)];
  envPaths.forEach(match => paths.add(match[0]));
  
  // Tilde expansion: ~/path
  const tildePaths = [...command.matchAll(/~\/[^\s]*/g)];
  tildePaths.forEach(match => paths.add(match[0]));
  
  // Relative paths with ./
  const relativeDotPaths = [...command.matchAll(/\.\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*/g)];
  relativeDotPaths.forEach(match => paths.add(match[0]));
  
  // Relative paths with ../
  const relativeDotDotPaths = [...command.matchAll(/\.\.\/[A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_.-]+)*/g)];
  relativeDotDotPaths.forEach(match => paths.add(match[0]));
  
  // Simple relative paths (e.g., home_link, home_link/, subdir)
  // Match word characters followed by optional slash and more path components
  const simpleRelativePaths = [...command.matchAll(/\s([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/?)/g)];
  simpleRelativePaths.forEach(match => {
    const path = match[1].trim();
    // Don't add if it's a common command
    if (!['ls', 'cat', 'echo', 'pwd', 'cd', 'rm', 'mkdir', 'cp', 'mv', 'touch'].includes(path)) {
      paths.add(path);
    }
  });
  
  return Array.from(paths);
}

/**
 * Check if a path is within the workspace (resolves symlinks)
 * @param {string} path - Path to check
 * @param {string} workspace - Workspace path
 * @returns {Promise<boolean>} True if path is within workspace
 */
async function isPathInWorkspace(path, workspace) {
  try {
    // Resolve both paths to real paths (handles symlinks)
    const realPath = await realpath(resolve(path));
    const realWorkspace = await realpath(resolve(workspace));
    
    // Check if real path is within real workspace
    return realPath === realWorkspace || realPath.startsWith(realWorkspace + sep);
  } catch {
    return false; // Invalid path
  }
}

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

  async _guardCommand(command, cwd) {
    const cmd = command.trim();
    const lower = cmd.toLowerCase();

    // Check dangerous patterns
    for (const pattern of DENY_PATTERNS) {
      if (pattern.test(lower)) {
        return 'Error: Command blocked by safety guard (dangerous pattern detected)';
      }
    }

    if (this.restrictToWorkspace) {
      // Quick check for obvious bypasses
      for (const pattern of BYPASS_PATTERNS) {
        if (pattern.test(cmd)) {
          return 'Error: Command blocked by safety guard (path traversal detected)';
        }
      }
      
      // Check for basic relative path traversal
      if (cmd.includes('../') || cmd.includes('..\\')) {
        return 'Error: Command blocked by safety guard (path traversal detected)';
      }
      
      // Extract all paths from command
      const paths = extractAllPaths(cmd);
      
      for (const pathStr of paths) {
        // Skip empty paths
        if (!pathStr || pathStr.trim() === '') continue;
        
        // Skip simple commands that don't involve file system access
        if (['echo', 'pwd', 'date', 'whoami', 'id'].some(cmd => pathStr.startsWith(cmd))) {
          continue;
        }
        
        // Skip relative paths that are clearly within workspace (start with ./)
        if (pathStr.startsWith('./')) {
          // Double-check they don't contain traversal
          if (!pathStr.includes('../')) {
            continue;
          }
        }
        
        // For paths starting with ~, they're outside workspace
        if (pathStr.startsWith('~')) {
          return 'Error: Command blocked by safety guard (path outside working dir)';
        }
        
        // For paths starting with $, they're environment variables pointing outside
        if (pathStr.startsWith('$')) {
          return 'Error: Command blocked by safety guard (path outside working dir)';
        }
        
        // For absolute paths, check containment
        if (pathStr.startsWith('/') || pathStr.match(/^[A-Za-z]:\\/)) {
          // Resolve relative to cwd if needed
          const fullPath = pathStr.startsWith('/') ? pathStr : resolve(cwd, pathStr);
          if (!(await isPathInWorkspace(fullPath, this.workingDir))) {
            return 'Error: Command blocked by safety guard (path outside working dir)';
          }
        }
        
        // For relative paths without ./, check if they resolve outside workspace
        if (!pathStr.startsWith('./') && !pathStr.startsWith('/') && !pathStr.match(/^[A-Za-z]:\\/)) {
          // This could be a relative path like "home_link" which is actually a symlink
          const resolvedPath = resolve(cwd, pathStr);
          if (!(await isPathInWorkspace(resolvedPath, this.workingDir))) {
            return 'Error: Command blocked by safety guard (path outside working dir)';
          }
        }
      }
    }

    return null; // Command allowed
  }
}
