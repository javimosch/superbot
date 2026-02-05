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
      const response = await this.provider.chat({
        messages,
        tools: this.tools.getDefinitions(),
        model: this.model
      });

      if (response.hasToolCalls) {
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
      const response = await this.provider.chat({
        messages,
        tools: this.tools.getDefinitions(),
        model: this.model
      });

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
