/**
 * Memory system for persistent agent memory
 * Supports daily notes and long-term memory
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureDir, todayDate } from '../utils/helpers.js';

export class MemoryStore {
  /**
   * @param {string} workspacePath - Path to workspace
   */
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.memoryDir = ensureDir(join(workspacePath, 'memory'));
    this.memoryFile = join(this.memoryDir, 'MEMORY.md');
  }

  /**
   * Get path to today's memory file
   * @returns {string}
   */
  getTodayFile() {
    return join(this.memoryDir, `${todayDate()}.md`);
  }

  /**
   * Read today's memory notes
   * @returns {string}
   */
  readToday() {
    const todayFile = this.getTodayFile();
    if (existsSync(todayFile)) {
      return readFileSync(todayFile, 'utf-8');
    }
    return '';
  }

  /**
   * Append content to today's memory notes
   * @param {string} content
   */
  appendToday(content) {
    const todayFile = this.getTodayFile();
    let existing = '';

    if (existsSync(todayFile)) {
      existing = readFileSync(todayFile, 'utf-8') + '\n';
    } else {
      existing = `# ${todayDate()}\n\n`;
    }

    writeFileSync(todayFile, existing + content, 'utf-8');
  }

  /**
   * Read long-term memory
   * @returns {string}
   */
  readLongTerm() {
    if (existsSync(this.memoryFile)) {
      return readFileSync(this.memoryFile, 'utf-8');
    }
    return '';
  }

  /**
   * Write to long-term memory
   * @param {string} content
   */
  writeLongTerm(content) {
    writeFileSync(this.memoryFile, content, 'utf-8');
  }

  /**
   * Get memory context for the agent
   * @returns {string}
   */
  getMemoryContext() {
    const parts = [];

    const longTerm = this.readLongTerm();
    if (longTerm) {
      parts.push('## Long-term Memory\n' + longTerm);
    }

    const today = this.readToday();
    if (today) {
      parts.push("## Today's Notes\n" + today);
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }
}
