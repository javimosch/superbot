/**
 * OpenAI-compatible LLM provider
 * Works with OpenAI, OpenRouter, and other compatible APIs
 */
import axios from 'axios';
import logger from '../utils/logger.js';
import { LLMProvider, createLLMResponse, createToolCall } from './base.js';

export class OpenAIProvider extends LLMProvider {
  /**
   * @param {object} params
   * @param {string} params.apiKey - API key
   * @param {string} [params.apiBase] - API base URL
   * @param {string} [params.defaultModel] - Default model
   */
  constructor({ apiKey, apiBase, defaultModel }) {
    super({ apiKey, apiBase, defaultModel });
    this.apiBase = apiBase || 'https://api.openai.com/v1';
    this.defaultModel = defaultModel || 'gpt-4';
  }

  /**
   * Send a chat completion request
   * @param {object} params
   * @param {object[]} params.messages - Messages array
   * @param {object[]} [params.tools] - Tool definitions
   * @param {string} [params.model] - Model to use
   * @param {number} [params.maxTokens=4096] - Max tokens
   * @param {number} [params.temperature=0.7] - Temperature
   * @returns {Promise<object>}
   */
  async chat({
    messages,
    tools = null,
    model = null,
    maxTokens = 4096,
    temperature = 0.7
  }) {
    const useModel = model || this.defaultModel;

    const payload = {
      model: useModel,
      messages,
      max_tokens: maxTokens,
      temperature
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const response = await axios.post(
        `${this.apiBase}/chat/completions`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }
      );

      return this._parseResponse(response.data);
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message;
      logger.error(`LLM error: ${errMsg}`);
      return createLLMResponse({
        content: `Error calling LLM: ${errMsg}`,
        finishReason: 'error'
      });
    }
  }

  /**
   * Parse OpenAI response into standard format
   * @param {object} data - Raw API response
   * @returns {object}
   */
  _parseResponse(data) {
    const choice = data.choices?.[0];
    if (!choice) {
      return createLLMResponse({ content: 'No response from LLM' });
    }

    const message = choice.message;
    const toolCalls = [];

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        let args = tc.function.arguments;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            args = { raw: args };
          }
        }
        toolCalls.push(createToolCall({
          id: tc.id,
          name: tc.function.name,
          arguments: args
        }));
      }
    }

    const usage = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens
    } : {};

    return createLLMResponse({
      content: message.content,
      toolCalls,
      finishReason: choice.finish_reason || 'stop',
      usage
    });
  }
}

/**
 * Create a provider from config
 * @param {object} config - Configuration object
 * @returns {OpenAIProvider}
 */
export function createProvider(config) {
  return new OpenAIProvider({
    apiKey: config.provider.apiKey,
    apiBase: config.provider.apiBase,
    defaultModel: config.provider.defaultModel
  });
}
