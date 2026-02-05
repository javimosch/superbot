/**
 * Message tool for sending messages to users
 */
import { Tool } from './base.js';
import { createOutboundMessage } from '../bus/events.js';

export class MessageTool extends Tool {
  /**
   * @param {object} options
   * @param {function} [options.sendCallback] - Callback to send messages
   */
  constructor({ sendCallback } = {}) {
    super();
    this._sendCallback = sendCallback;
    this._defaultChannel = '';
    this._defaultChatId = '';
  }

  /**
   * Set the current message context
   * @param {string} channel
   * @param {string} chatId
   */
  setContext(channel, chatId) {
    this._defaultChannel = channel;
    this._defaultChatId = chatId;
  }

  /**
   * Set the send callback
   * @param {function} callback
   */
  setSendCallback(callback) {
    this._sendCallback = callback;
  }

  get name() { return 'message'; }
  get description() { return 'Send a message to the user. Use this when you want to communicate something.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The message content to send' },
        channel: { type: 'string', description: 'Optional: target channel (telegram, whatsapp, etc.)' },
        chat_id: { type: 'string', description: 'Optional: target chat/user ID' }
      },
      required: ['content']
    };
  }

  async execute({ content, channel, chat_id }) {
    const targetChannel = channel || this._defaultChannel;
    const targetChatId = chat_id || this._defaultChatId;

    if (!targetChannel || !targetChatId) {
      return 'Error: No target channel/chat specified';
    }

    if (!this._sendCallback) {
      return 'Error: Message sending not configured';
    }

    const msg = createOutboundMessage({
      channel: targetChannel,
      chatId: targetChatId,
      content
    });

    try {
      await this._sendCallback(msg);
      return `Message sent to ${targetChannel}:${targetChatId}`;
    } catch (err) {
      return `Error sending message: ${err.message}`;
    }
  }
}
