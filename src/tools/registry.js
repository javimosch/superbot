/**
 * Tool registry for dynamic tool management
 */
import logger from '../utils/logger.js';

export class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  /**
   * Register a tool
   * @param {import('./base.js').Tool} tool
   */
  register(tool) {
    this._tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   * @param {string} name
   */
  unregister(name) {
    this._tools.delete(name);
  }

  /**
   * Get a tool by name
   * @param {string} name
   * @returns {import('./base.js').Tool|undefined}
   */
  get(name) {
    return this._tools.get(name);
  }

  /**
   * Check if a tool is registered
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._tools.has(name);
  }

  /**
   * Get all tool definitions in OpenAI format
   * @returns {object[]}
   */
  getDefinitions() {
    return Array.from(this._tools.values()).map(tool => tool.toSchema());
  }

  /**
   * Execute a tool by name
   * @param {string} name - Tool name
   * @param {object} params - Tool parameters
   * @returns {Promise<string>}
   */
  async execute(name, params) {
    const tool = this._tools.get(name);
    if (!tool) {
      return `Error: Tool '${name}' not found`;
    }

    try {
      const errors = tool.validateParams(params);
      if (errors.length > 0) {
        return `Error: Invalid parameters for tool '${name}': ${errors.join('; ')}`;
      }
      return await tool.execute(params);
    } catch (err) {
      logger.error(`Tool ${name} error: ${err.message}`);
      return `Error executing ${name}: ${err.message}`;
    }
  }

  /**
   * Get list of registered tool names
   * @returns {string[]}
   */
  get toolNames() {
    return Array.from(this._tools.keys());
  }

  /**
   * Get number of registered tools
   * @returns {number}
   */
  get size() {
    return this._tools.size;
  }
}
