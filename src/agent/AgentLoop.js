/**
 * Agent loop: the core processing engine
 */
import logger from '../utils/logger.js';
import { ContextBuilder } from './ContextBuilder.js';
import { SubagentManager } from './SubagentManager.js';
import { ToolRegistry, ReadFileTool, WriteFileTool, EditFileTool, ListDirTool, ExecTool, WebSearchTool, WebFetchTool, MessageTool, SpawnTool } from '../tools/index.js';

export class AgentLoop {
  /**
   * @param {object} options
   * @param {object} options.bus - Message bus
   * @param {object} options.provider - LLM provider
   * @param {string} options.workspacePath - Workspace path
   * @param {object} options.sessionManager - Session manager
   * @param {string} [options.model] - Model to use
   * @param {number} [options.maxIterations=20] - Max tool iterations
   * @param {string} [options.braveApiKey] - Brave API key
   * @param {object} [options.execConfig] - Exec tool config
   */
  constructor({
    bus,
    provider,
    workspacePath,
    sessionManager,
    model,
    maxIterations = 20,
    braveApiKey,
    execConfig = {}
  }) {
    this.bus = bus;
    this.provider = provider;
    this.workspacePath = workspacePath;
    this.sessionManager = sessionManager;
    this.model = model || provider.getDefaultModel();
    this.maxIterations = maxIterations;
    this.braveApiKey = braveApiKey;
    this.execConfig = execConfig;

    this.context = new ContextBuilder(workspacePath);
    this.tools = new ToolRegistry();
    this.subagents = new SubagentManager({
      provider,
      workspacePath,
      bus,
      model: this.model,
      braveApiKey,
      execConfig
    });

    this._running = false;
    this._registerDefaultTools();
  }

  _registerDefaultTools() {
    // File tools
    this.tools.register(new ReadFileTool());
    this.tools.register(new WriteFileTool());
    this.tools.register(new EditFileTool());
    this.tools.register(new ListDirTool());

    // Shell tool
    this.tools.register(new ExecTool({
      workingDir: this.workspacePath,
      timeout: this.execConfig.timeout || 60,
      restrictToWorkspace: this.execConfig.restrictToWorkspace || false
    }));

    // Web tools
    this.tools.register(new WebSearchTool({ apiKey: this.braveApiKey }));
    this.tools.register(new WebFetchTool());

    // Message tool
    const messageTool = new MessageTool({
      sendCallback: (msg) => this.bus.publishOutbound(msg)
    });
    this.tools.register(messageTool);

    // Spawn tool
    const spawnTool = new SpawnTool({ manager: this.subagents });
    this.tools.register(spawnTool);
  }

  /**
   * Run the agent loop, processing messages from the bus
   */
  async run() {
    this._running = true;
    logger.info('Agent loop started');

    while (this._running) {
      try {
        const msg = await this.bus.consumeInbound(1000);
        await this._processMessage(msg);
      } catch (err) {
        if (err.message !== 'Timeout') {
          logger.error(`Agent loop error: ${err.message}`);
        }
      }
    }
  }

  /**
   * Stop the agent loop
   */
  stop() {
    this._running = false;
    logger.info('Agent loop stopping');
  }

  /**
   * Check if we should force tool execution for xiaomi model
   */
  _shouldForceToolExecution(userMessage) {
    const toolKeywords = [
      'find', 'search', 'look for', 'list', 'ls', 'dir', 'cat', 'read', 'show',
      'exec', 'run', 'execute', 'web search', 'search web', 'fetch', 'get'
    ];
    
    return toolKeywords.some(keyword => userMessage.includes(keyword));
  }

  /**
   * Get direct tool call for xiaomi model when it refuses to use tools
   */
  _getDirectToolCall(userMessage, originalContent) {
    // File search patterns
    if (userMessage.includes('find') && userMessage.includes('pdf')) {
      return {
        name: 'exec',
        arguments: { command: "find . -name '*.pdf' -type f" }
      };
    }
    
    if (userMessage.includes('find') && (userMessage.includes('txt') || userMessage.includes('text'))) {
      return {
        name: 'exec',
        arguments: { command: "find . -name '*.txt' -type f" }
      };
    }
    
    if (userMessage.includes('search') && userMessage.includes('pdf')) {
      return {
        name: 'exec',
        arguments: { command: "find . -name '*.pdf' -type f" }
      };
    }
    
    if (userMessage.includes('search') && (userMessage.includes('txt') || userMessage.includes('text'))) {
      return {
        name: 'exec',
        arguments: { command: "find . -name '*.txt' -type f" }
      };
    }
    
    // Generic find patterns
    if (userMessage.match(/find.*\.(pdf|txt|doc|md|json)/)) {
      const match = userMessage.match(/\.(pdf|txt|doc|md|json)/);
      const ext = match[1];
      return {
        name: 'exec',
        arguments: { command: `find . -name '*.${ext}' -type f` }
      };
    }
    
    if (userMessage.includes('find') && userMessage.includes('all')) {
      const match = userMessage.match(/find all (\w+) files/);
      if (match) {
        const fileType = match[1];
        return {
          name: 'exec',
          arguments: { command: `find . -name '*.${fileType}' -type f` }
        };
      }
    }
    
    // List directory patterns
    if (userMessage.match(/^(ls|dir|list)/) || userMessage.includes('list directory')) {
      return {
        name: 'list_dir',
        arguments: { path: '.' }
      };
    }
    
    // Read file patterns
    if (userMessage.match(/^(cat|read|type|show)/) || userMessage.includes('show file') || userMessage.includes('read file')) {
      const match = originalContent.match(/(?:cat|read|type|show)\s+([^\s]+)/);
      if (match) {
        return {
          name: 'read_file',
          arguments: { path: match[1] }
        };
      }
    }
    
    // Web search patterns
    if (userMessage.includes('web search') || userMessage.includes('search web')) {
      // Extract search query
      const match = originalContent.match(/(?:web search|search web):\s*(.+)/i);
      if (match) {
        return {
          name: 'web_search',
          arguments: { query: match[1] }
        };
      }
    }
    
    return null;
  }

  /**
   * Process a single inbound message
   * @param {object} msg - Inbound message
   * @returns {Promise<object|null>}
   */
  async _processMessage(msg) {
    // Handle system messages (subagent announces)
    if (msg.channel === 'system') {
      return this._processSystemMessage(msg);
    }

    logger.info(`Processing message from ${msg.channel}:${msg.senderId}`);

    // Get or create session
    const session = this.sessionManager.getOrCreate(msg.sessionKey);

    // Update tool contexts
    const messageTool = this.tools.get('message');
    if (messageTool) messageTool.setContext(msg.channel, msg.chatId);

    const spawnTool = this.tools.get('spawn');
    if (spawnTool) spawnTool.setContext(msg.channel, msg.chatId);

    // Build messages
    let messages = this.context.buildMessages({
      history: session.getHistory(),
      currentMessage: msg.content,
      media: msg.media
    });

    // Agent loop
    let finalContent = null;

    for (let i = 0; i < this.maxIterations; i++) {
      // Debug logging for available tools
      if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
        const tools = this.tools.getDefinitions();
        console.log(`[DEBUG] Sending ${tools.length} tools to model:`);
        tools.forEach((tool, index) => {
          console.log(`[DEBUG] Tool ${index + 1}: ${tool.function.name} - ${tool.function.description.substring(0, 100)}...`);
        });
      }

      const response = await this.provider.chat({
        messages,
        tools: this.tools.getDefinitions(),
        model: this.model
      });

      // Debug logging for model response
      if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
        console.log(`[DEBUG] Model response: hasToolCalls=${response.hasToolCalls}, content="${response.content}"`);
      }

      // For xiaomi model: if no tool calls but should have used tools, execute directly
      if (this.model === 'xiaomi/mimo-v2-flash' && !response.hasToolCalls) {
        const userMessage = msg.content.toLowerCase();
        if (this._shouldForceToolExecution(userMessage)) {
          const forcedCall = this._getDirectToolCall(userMessage, msg.content);
          if (forcedCall) {
            if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
              console.log(`[DEBUG] Model refused tools, executing directly: ${forcedCall.name}`);
            }
            
            const result = await this.tools.execute(forcedCall.name, forcedCall.arguments);
            
            if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
              console.log(`[DEBUG] Direct tool result: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`);
            }
            
            session.addMessage('user', msg.content);
            session.addMessage('assistant', `I used the ${forcedCall.name} tool to help you.`);
            this.sessionManager.save(session);
            return { content: result };
          }
        }
      }

      if (response.hasToolCalls) {
        // Debug logging for tool calls
        if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
          console.log('[DEBUG] Tool calls requested:');
          response.toolCalls.forEach((tc, index) => {
            console.log(`[DEBUG] Tool ${index + 1}: ${tc.name}(${JSON.stringify(tc.arguments)})`);
          });
        }

        // Add assistant message with tool calls
        const toolCallDicts = response.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
        }));
        messages = this.context.addAssistantMessage(messages, response.content, toolCallDicts);

        // Execute tools
        for (const tc of response.toolCalls) {
          logger.debug(`Executing tool: ${tc.name}`);
          const result = await this.tools.execute(tc.name, tc.arguments);
          
          // Debug logging for tool results
          if (process.env.DEBUG && process.env.DEBUG.includes('*')) {
            console.log(`[DEBUG] Tool ${tc.name} result: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`);
          }
          
          messages = this.context.addToolResult(messages, tc.id, tc.name, result);
        }
      } else {
        finalContent = response.content;
        break;
      }
    }

    if (!finalContent) {
      finalContent = "I've completed processing but have no response to give.";
    }

    // Save to session
    session.addMessage('user', msg.content);
    session.addMessage('assistant', finalContent);
    this.sessionManager.save(session);

    // Publish response
    const { createOutboundMessage } = await import('../bus/events.js');
    const outMsg = createOutboundMessage({
      channel: msg.channel,
      chatId: msg.chatId,
      content: finalContent
    });
    this.bus.publishOutbound(outMsg);

    return outMsg;
  }

  async _processSystemMessage(msg) {
    logger.info(`Processing system message from ${msg.senderId}`);

    // Parse origin from chatId (format: "channel:chatId")
    let originChannel = 'cli';
    let originChatId = msg.chatId;

    if (msg.chatId.includes(':')) {
      const parts = msg.chatId.split(':', 2);
      originChannel = parts[0];
      originChatId = parts[1];
    }

    const sessionKey = `${originChannel}:${originChatId}`;
    const session = this.sessionManager.getOrCreate(sessionKey);

    // Update tool contexts
    const messageTool = this.tools.get('message');
    if (messageTool) messageTool.setContext(originChannel, originChatId);

    const spawnTool = this.tools.get('spawn');
    if (spawnTool) spawnTool.setContext(originChannel, originChatId);

    // Build messages
    let messages = this.context.buildMessages({
      history: session.getHistory(),
      currentMessage: msg.content
    });

    // Agent loop (limited)
    let finalContent = null;

    for (let i = 0; i < this.maxIterations; i++) {
      logger.debug(`Agent loop iteration ${i + 1}/${this.maxIterations}`);
      logger.debug(`Calling provider.chat with model: ${this.model}`);
      const startTime = Date.now();
      
      const response = await this.provider.chat({
        messages,
        tools: this.tools.getDefinitions(),
        model: this.model
      });
      
      const responseTime = Date.now() - startTime;
      logger.debug(`Provider responded in ${responseTime}ms`);
      logger.debug(`Response has tool calls: ${response.hasToolCalls}`);

      if (response.hasToolCalls) {
        const toolCallDicts = response.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
        }));
        messages = this.context.addAssistantMessage(messages, response.content, toolCallDicts);

        for (const tc of response.toolCalls) {
          logger.debug(`Executing tool: ${tc.name}`);
          const result = await this.tools.execute(tc.name, tc.arguments);
          messages = this.context.addToolResult(messages, tc.id, tc.name, result);
        }
      } else {
        finalContent = response.content;
        break;
      }
    }

    if (!finalContent) finalContent = 'Background task completed.';

    // Save to session
    session.addMessage('user', `[System: ${msg.senderId}] ${msg.content}`);
    session.addMessage('assistant', finalContent);
    this.sessionManager.save(session);

    // Publish response
    const { createOutboundMessage } = await import('../bus/events.js');
    const outMsg = createOutboundMessage({
      channel: originChannel,
      chatId: originChatId,
      content: finalContent
    });
    this.bus.publishOutbound(outMsg);

    return outMsg;
  }

  /**
   * Process a message directly (for CLI/API usage)
   * @param {string} content - Message content
   * @param {string} sessionKey - Session key
   * @returns {Promise<string>}
   */
  async processDirect(content, sessionKey = 'cli:direct') {
    const { createInboundMessage } = await import('../bus/events.js');

    const [channel, chatId] = sessionKey.includes(':') ? sessionKey.split(':', 2) : ['cli', sessionKey];

    const msg = createInboundMessage({
      channel,
      senderId: 'user',
      chatId,
      content
    });

    const response = await this._processMessage(msg);
    return response?.content || '';
  }
}
