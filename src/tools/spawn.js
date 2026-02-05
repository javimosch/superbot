/**
 * Spawn tool for creating background subagents
 */
import { Tool } from './base.js';

export class SpawnTool extends Tool {
  /**
   * @param {object} options
   * @param {object} options.manager - SubagentManager instance
   */
  constructor({ manager }) {
    super();
    this._manager = manager;
    this._originChannel = 'cli';
    this._originChatId = 'direct';
  }

  /**
   * Set the origin context for subagent announcements
   * @param {string} channel
   * @param {string} chatId
   */
  setContext(channel, chatId) {
    this._originChannel = channel;
    this._originChatId = chatId;
  }

  get name() { return 'spawn'; }
  get description() {
    return 'Spawn a subagent to handle a task in the background. ' +
           'Use this for complex or time-consuming tasks that can run independently. ' +
           'The subagent will complete the task and report back when done.';
  }
  get parameters() {
    return {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task for the subagent to complete' },
        label: { type: 'string', description: 'Optional short label for the task (for display)' }
      },
      required: ['task']
    };
  }

  async execute({ task, label }) {
    if (!this._manager) {
      return 'Error: Subagent manager not configured';
    }

    return await this._manager.spawn({
      task,
      label,
      originChannel: this._originChannel,
      originChatId: this._originChatId
    });
  }
}
