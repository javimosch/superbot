/**
 * Session management for conversation history
 * Sessions stored as JSONL files under workspace/sessions/
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ensureDir, safeFilename, timestamp } from '../utils/helpers.js';
import logger from '../utils/logger.js';

/**
 * A conversation session
 */
class Session {
  /**
   * @param {string} key - Session key (channel:chatId)
   */
  constructor(key) {
    this.key = key;
    this.messages = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.metadata = {};
  }

  /**
   * Add a message to the session
   * @param {string} role - Message role
   * @param {string} content - Message content
   */
  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: timestamp()
    });
    this.updatedAt = new Date();
  }

  /**
   * Get message history for LLM context
   * @param {number} maxMessages - Max messages to return
   * @returns {Array}
   */
  getHistory(maxMessages = 50) {
    const recent = this.messages.length > maxMessages
      ? this.messages.slice(-maxMessages)
      : this.messages;
    return recent.map(m => ({ role: m.role, content: m.content }));
  }

  /**
   * Clear all messages
   */
  clear() {
    this.messages = [];
    this.updatedAt = new Date();
  }
}

export class SessionManager {
  /**
   * @param {string} workspacePath - Path to workspace
   */
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.sessionsDir = ensureDir(join(workspacePath, 'sessions'));
    this._cache = new Map();
  }

  /**
   * Get session file path
   * @param {string} key - Session key
   * @returns {string}
   */
  _getSessionPath(key) {
    const safeKey = safeFilename(key.replace(/:/g, '_'));
    return join(this.sessionsDir, `${safeKey}.jsonl`);
  }

  /**
   * Get or create a session
   * @param {string} key - Session key
   * @returns {Session}
   */
  getOrCreate(key) {
    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    let session = this._load(key);
    if (!session) {
      session = new Session(key);
    }

    this._cache.set(key, session);
    return session;
  }

  /**
   * Load a session from disk
   * @param {string} key - Session key
   * @returns {Session|null}
   */
  _load(key) {
    const path = this._getSessionPath(key);
    if (!existsSync(path)) return null;

    try {
      const session = new Session(key);
      const lines = readFileSync(path, 'utf-8').split('\n').filter(l => l.trim());

      for (const line of lines) {
        const data = JSON.parse(line);
        if (data._type === 'metadata') {
          session.metadata = data.metadata || {};
          session.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
        } else {
          session.messages.push(data);
        }
      }

      return session;
    } catch (err) {
      logger.warn(`Failed to load session ${key}: ${err.message}`);
      return null;
    }
  }

  /**
   * Save a session to disk
   * @param {Session} session
   */
  save(session) {
    const path = this._getSessionPath(session.key);
    const lines = [];

    // Metadata first
    lines.push(JSON.stringify({
      _type: 'metadata',
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      metadata: session.metadata
    }));

    // Messages
    for (const msg of session.messages) {
      lines.push(JSON.stringify(msg));
    }

    writeFileSync(path, lines.join('\n') + '\n');
    this._cache.set(session.key, session);
  }

  /**
   * Delete a session
   * @param {string} key - Session key
   * @returns {boolean}
   */
  delete(key) {
    this._cache.delete(key);
    const path = this._getSessionPath(key);
    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
    return false;
  }

  /**
   * List all sessions
   * @returns {Array}
   */
  listSessions() {
    const sessions = [];

    for (const file of readdirSync(this.sessionsDir)) {
      if (!file.endsWith('.jsonl')) continue;

      const path = join(this.sessionsDir, file);
      try {
        const firstLine = readFileSync(path, 'utf-8').split('\n')[0];
        if (firstLine) {
          const data = JSON.parse(firstLine);
          if (data._type === 'metadata') {
            sessions.push({
              key: file.replace('.jsonl', '').replace(/_/g, ':'),
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              path
            });
          }
        }
      } catch { /* ignore */ }
    }

    return sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
}
