/**
 * Base channel class
 */
import logger from '../utils/logger.js';
import { createInboundMessage } from '../bus/events.js';

export class BaseChannel {
  /**
   * @param {object} config - Channel config
   * @param {object} bus - Message bus
   */
  constructor(config, bus) {
    this.config = config;
    this.bus = bus;
    this._running = false;
  }

  /**
   * Channel name
   * @returns {string}
   */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Start the channel
   */
  async start() {
    throw new Error('Not implemented');
  }

  /**
   * Stop the channel
   */
  async stop() {
    this._running = false;
  }

  /**
   * Send a message through this channel
   * @param {object} msg - Outbound message
   */
  async send(msg) {
    throw new Error('Not implemented');
  }

  /**
   * Handle an incoming message
   * @param {object} params
   * @param {string} params.senderId
   * @param {string} params.chatId
   * @param {string} params.content
   * @param {string[]} [params.media]
   * @param {object} [params.metadata]
   */
  async _handleMessage({ senderId, chatId, content, media = [], metadata = {} }) {
    const msg = createInboundMessage({
      channel: this.name,
      senderId,
      chatId,
      content,
      media,
      metadata
    });

    logger.debug(`${this.name}: received message from ${senderId}`);
    this.bus.publishInbound(msg);
  }
}
