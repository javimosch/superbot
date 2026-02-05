/**
 * Utility functions for superbot
 */
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath - Path to directory
 * @returns {string} - The resolved path
 */
export function ensureDir(dirPath) {
  const resolved = resolve(dirPath.replace(/^~/, homedir()));
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

/**
 * Get the superbot data directory (~/.superbot)
 * @returns {string}
 */
export function getDataPath() {
  return ensureDir(join(homedir(), '.superbot'));
}

/**
 * Get the workspace path
 * @param {string} [workspace] - Optional custom workspace path
 * @returns {string}
 */
export function getWorkspacePath(workspace) {
  if (workspace) {
    return ensureDir(workspace.replace(/^~/, homedir()));
  }
  return ensureDir(join(homedir(), '.superbot', 'workspace'));
}

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string}
 */
export function todayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current timestamp in ISO format
 * @returns {string}
 */
export function timestamp() {
  return new Date().toISOString();
}

/**
 * Truncate a string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @param {string} suffix - Suffix to add if truncated
 * @returns {string}
 */
export function truncateString(str, maxLen = 100, suffix = '...') {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - suffix.length) + suffix;
}

/**
 * Convert a string to a safe filename
 * @param {string} name - String to convert
 * @returns {string}
 */
export function safeFilename(name) {
  const unsafe = '<>:"/\\|?*';
  let safe = name;
  for (const char of unsafe) {
    safe = safe.replaceAll(char, '_');
  }
  return safe.trim();
}

/**
 * Parse a session key into channel and chatId
 * @param {string} key - Session key in format "channel:chatId"
 * @returns {{channel: string, chatId: string}}
 */
export function parseSessionKey(key) {
  const parts = key.split(':', 2);
  if (parts.length !== 2) {
    throw new Error(`Invalid session key: ${key}`);
  }
  return { channel: parts[0], chatId: parts[1] };
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
