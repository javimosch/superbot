/**
 * Subagent manager for background task execution
 */
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { createInboundMessage } from '../bus/events.js';
import { ToolRegistry, ReadFileTool, WriteFileTool, ListDirTool, ExecTool, WebSearchTool, WebFetchTool } from '../tools/index.js';

export class SubagentManager {
  /**
   * @param {object} options
   * @param {object} options.provider - LLM provider
   * @param {string} options.workspacePath - Workspace path
   * @param {object} options.bus - Message bus
   * @param {string} [options.model] - Model to use
   * @param {string} [options.braveApiKey] - Brave API key
   * @param {object} [options.execConfig] - Exec tool config
   */
  constructor({ provider, workspacePath, bus, model, braveApiKey, execConfig = {} }) {
    this.provider = provider;
    this.workspacePath = workspacePath;
    this.bus = bus;
    this.model = model || provider.getDefaultModel();
    this.braveApiKey = braveApiKey;
    this.execConfig = execConfig;
    this._runningTasks = new Map();
  }

  /**
   * Spawn a subagent
   * @param {object} params
   * @param {string} params.task
   * @param {string} [params.label]
   * @param {string} [params.originChannel]
   * @param {string} [params.originChatId]
   * @returns {Promise<string>}
   */
  async spawn({ task, label, originChannel = 'cli', originChatId = 'direct' }) {
    const taskId = uuidv4().slice(0, 8);
    const displayLabel = label || (task.length > 30 ? task.slice(0, 30) + '...' : task);

    // Run in background
    setImmediate(() => {
      this._runSubagent(taskId, task, displayLabel, { channel: originChannel, chatId: originChatId })
        .finally(() => this._runningTasks.delete(taskId));
    });

    this._runningTasks.set(taskId, { label: displayLabel, startedAt: Date.now() });
    logger.info(`Spawned subagent [${taskId}]: ${displayLabel}`);

    return `Subagent [${displayLabel}] started (id: ${taskId}). I'll notify you when it completes.`;
  }

  async _runSubagent(taskId, task, label, origin) {
    logger.info(`Subagent [${taskId}] starting task: ${label}`);

    try {
      // Build subagent tools (no message, no spawn)
      const tools = new ToolRegistry();
      tools.register(new ReadFileTool());
      tools.register(new WriteFileTool());
      tools.register(new ListDirTool());
      tools.register(new ExecTool({
        workingDir: this.workspacePath,
        timeout: this.execConfig.timeout || 60,
        restrictToWorkspace: this.execConfig.restrictToWorkspace || false
      }));
      tools.register(new WebSearchTool({ apiKey: this.braveApiKey }));
      tools.register(new WebFetchTool());

      // Build messages
      const systemPrompt = this._buildSubagentPrompt(task);
      let messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task }
      ];

      // Run loop
      const maxIterations = 15;
      let finalResult = null;

      for (let i = 0; i < maxIterations; i++) {
        const response = await this.provider.chat({
          messages,
          tools: tools.getDefinitions(),
          model: this.model
        });

        if (response.hasToolCalls) {
          // Add assistant message with tool calls
          const toolCallDicts = response.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
          }));
          messages.push({ role: 'assistant', content: response.content || '', tool_calls: toolCallDicts });

          // Execute tools
          for (const tc of response.toolCalls) {
            logger.debug(`Subagent [${taskId}] executing: ${tc.name}`);
            const result = await tools.execute(tc.name, tc.arguments);
            messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: result });
          }
        } else {
          finalResult = response.content;
          break;
        }
      }

      if (!finalResult) finalResult = 'Task completed but no final response was generated.';

      logger.info(`Subagent [${taskId}] completed successfully`);
      await this._announceResult(taskId, label, task, finalResult, origin, 'ok');

    } catch (err) {
      logger.error(`Subagent [${taskId}] failed: ${err.message}`);
      await this._announceResult(taskId, label, task, `Error: ${err.message}`, origin, 'error');
    }
  }

  async _announceResult(taskId, label, task, result, origin, status) {
    const statusText = status === 'ok' ? 'completed successfully' : 'failed';

    const content = `[Subagent '${label}' ${statusText}]

Task: ${task}

Result:
${result}

Summarize this naturally for the user. Keep it brief (1-2 sentences). Do not mention technical details like "subagent" or task IDs.`;

    const msg = createInboundMessage({
      channel: 'system',
      senderId: 'subagent',
      chatId: `${origin.channel}:${origin.chatId}`,
      content
    });

    this.bus.publishInbound(msg);
    logger.debug(`Subagent [${taskId}] announced result to ${origin.channel}:${origin.chatId}`);
  }

  _buildSubagentPrompt(task) {
    return `# Subagent

You are a subagent spawned by the main agent to complete a specific task.

## Your Task
${task}

## Rules
1. Stay focused - complete only the assigned task, nothing else
2. Your final response will be reported back to the main agent
3. Do not initiate conversations or take on side tasks
4. Be concise but informative in your findings

## What You Can Do
- Read and write files in the workspace
- Execute shell commands
- Search the web and fetch web pages
- Complete the task thoroughly

## What You Cannot Do
- Send messages directly to users (no message tool available)
- Spawn other subagents
- Access the main agent's conversation history

## Workspace
Your workspace is at: ${this.workspacePath}

When you have completed the task, provide a clear summary of your findings or actions.`;
  }

  /**
   * Get count of running subagents
   * @returns {number}
   */
  getRunningCount() {
    return this._runningTasks.size;
  }
}
