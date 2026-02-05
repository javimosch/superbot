/**
 * Base LLM provider interface and response types
 */

/**
 * Create a tool call request object
 * @param {object} params
 * @param {string} params.id - Tool call ID
 * @param {string} params.name - Function name
 * @param {object} params.arguments - Function arguments
 * @returns {object}
 */
export function createToolCall({ id, name, arguments: args }) {
  return { id, name, arguments: args };
}

/**
 * Create an LLM response object
 * @param {object} params
 * @param {string|null} params.content - Response content
 * @param {object[]} [params.toolCalls] - Tool calls
 * @param {string} [params.finishReason] - Finish reason
 * @param {object} [params.usage] - Token usage
 * @returns {object}
 */
export function createLLMResponse({
  content = null,
  toolCalls = [],
  finishReason = 'stop',
  usage = {}
}) {
  return {
    content,
    toolCalls,
    finishReason,
    usage,
    get hasToolCalls() {
      return this.toolCalls.length > 0;
    }
  };
}

/**
 * Base LLM provider class
 * @abstract
 */
export class LLMProvider {
  /**
   * @param {object} params
   * @param {string} [params.apiKey]
   * @param {string} [params.apiBase]
   * @param {string} [params.defaultModel]
   */
  constructor({ apiKey, apiBase, defaultModel } = {}) {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.defaultModel = defaultModel;
  }

  /**
   * Send a chat completion request
   * @param {object} params
   * @param {object[]} params.messages - Messages array
   * @param {object[]} [params.tools] - Tool definitions
   * @param {string} [params.model] - Model to use
   * @param {number} [params.maxTokens] - Max tokens
   * @param {number} [params.temperature] - Temperature
   * @returns {Promise<object>} - LLMResponse
   * @abstract
   */
  async chat({ messages, tools, model, maxTokens, temperature }) {
    throw new Error('Not implemented');
  }

  /**
   * Get the default model
   * @returns {string}
   */
  getDefaultModel() {
    return this.defaultModel || 'gpt-4';
  }
}
