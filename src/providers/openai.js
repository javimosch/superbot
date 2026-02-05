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
   * @param {string[]} [params.fallbackModels] - Fallback models in priority order
   */
  constructor({ apiKey, apiBase, defaultModel, fallbackModels = [] }) {
    super({ apiKey, apiBase, defaultModel });
    this.apiBase = apiBase || 'https://api.openai.com/v1';
    this.defaultModel = defaultModel || 'gpt-4';
    this.fallbackModels = fallbackModels;
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
      
      // Force tool usage for problematic models
      if (useModel === 'xiaomi/mimo-v2-flash') {
        // For xiaomi model, try different tool_choice strategies
        const userMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
        
        if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
          console.log(`[DEBUG] Xiaomi model message: "${userMessage}"`);
        }
        
        if (this._shouldForceTool(userMessage)) {
          // Force specific tool based on message content
          const forcedTool = this._getForcedTool(userMessage, tools);
          if (forcedTool) {
            payload.tool_choice = {
              type: "function",
              function: { name: forcedTool }
            };
            if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
              console.log(`[DEBUG] Forcing tool: ${forcedTool}`);
            }
          } else {
            payload.tool_choice = 'auto';
            if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
              console.log(`[DEBUG] Using auto tool choice`);
            }
          }
        } else {
          payload.tool_choice = 'auto';
          if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
            console.log(`[DEBUG] No tool forcing needed, using auto`);
          }
        }
      } else {
        payload.tool_choice = 'auto';
      }
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
          timeout: 30000 // 30 second timeout
        }
      );

      return this._parseResponse(response.data);
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message;
      logger.error(`LLM error with ${useModel}: ${errMsg}`);
      
      // If it's a timeout or network error, try fallback models
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        const fallbackModels = this.fallbackModels.length > 0 ? this.fallbackModels : ['openai/gpt-3.5-turbo'];
        
        if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
          console.log(`[DEBUG] Model ${useModel} failed, trying ${fallbackModels.length} fallback models`);
        }
        
        for (const fallbackModel of fallbackModels) {
          if (fallbackModel === useModel) continue; // Skip if same as current model
          
          logger.warn(`Model ${useModel} timed out, trying fallback: ${fallbackModel}`);
          if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
            console.log(`[DEBUG] Attempting fallback model: ${fallbackModel}`);
          }
          
          try {
            const result = await this.chat({
              messages,
              tools,
              model: fallbackModel,
              maxTokens,
              temperature
            });
            
            if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
              console.log(`[DEBUG] Fallback model ${fallbackModel} succeeded`);
            }
            
            return result;
          } catch (fallbackErr) {
            logger.error(`Fallback model ${fallbackModel} also failed: ${fallbackErr.message}`);
            if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
              console.log(`[DEBUG] Fallback model ${fallbackModel} failed: ${fallbackErr.message}`);
            }
            continue; // Try next fallback
          }
        }
        
        if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
          console.log(`[DEBUG] All fallback models exhausted`);
        }
      }
      
      return createLLMResponse({
        content: `Error calling LLM: ${errMsg}`,
        finishReason: 'error'
      });
    }
  }

  /**
   * Determine if we should force tool usage based on message content
   */
  _shouldForceTool(userMessage) {
    const toolKeywords = [
      'find', 'search', 'look for', 'list', 'ls', 'dir', 'cat', 'read', 'show',
      'exec', 'run', 'execute', 'web search', 'search web', 'fetch', 'get'
    ];
    
    return toolKeywords.some(keyword => userMessage.includes(keyword));
  }

  /**
   * Get the appropriate tool to force based on message content
   */
  _getForcedTool(userMessage, availableTools) {
    const toolNames = availableTools.map(t => t.function.name);
    
    // File operations
    if (userMessage.includes('find') || userMessage.includes('search')) {
      if (toolNames.includes('exec')) return 'exec';
    }
    
    if (userMessage.includes('list') || userMessage.includes('ls') || userMessage.includes('dir')) {
      if (toolNames.includes('list_dir')) return 'list_dir';
    }
    
    if (userMessage.includes('read') || userMessage.includes('cat') || userMessage.includes('show')) {
      if (toolNames.includes('read_file')) return 'read_file';
    }
    
    // Web operations
    if (userMessage.includes('web search') || userMessage.includes('search web')) {
      if (toolNames.includes('web_search')) return 'web_search';
    }
    
    if (userMessage.includes('fetch') || userMessage.includes('get url')) {
      if (toolNames.includes('web_fetch')) return 'web_fetch';
    }
    
    // Default to exec if available
    if (toolNames.includes('exec')) return 'exec';
    
    return null;
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
    defaultModel: config.provider.defaultModel,
    fallbackModels: config.provider.fallbackModels || []
  });
}
