/**
 * Async message bus for decoupled channel-agent communication
 * 
 * Uses in-memory queues with async consume operations.
 * Channels push to inbound, agent consumes and pushes to outbound,
 * channel manager dispatches outbound to appropriate channels.
 */
import logger from '../utils/logger.js';

/**
 * Simple async queue implementation
 */
class AsyncQueue {
  constructor() {
    this._items = [];
    this._waiters = [];
  }

  /**
   * Push an item to the queue
   * @param {*} item
   */
  push(item) {
    if (this._waiters.length > 0) {
      const resolve = this._waiters.shift();
      resolve(item);
    } else {
      this._items.push(item);
    }
  }

  /**
   * Pop an item from the queue (async, waits if empty)
   * @param {number} [timeoutMs] - Optional timeout in ms
   * @returns {Promise<*>}
   */
  async pop(timeoutMs = 0) {
    if (this._items.length > 0) {
      return this._items.shift();
    }

    return new Promise((resolve, reject) => {
      const waiter = resolve;
      this._waiters.push(waiter);

      if (timeoutMs > 0) {
        setTimeout(() => {
          const idx = this._waiters.indexOf(waiter);
          if (idx !== -1) {
            this._waiters.splice(idx, 1);
            reject(new Error('Timeout'));
          }
        }, timeoutMs);
      }
    });
  }

  /**
   * Get current queue size
   * @returns {number}
   */
  get size() {
    return this._items.length;
  }
}

/**
 * Message bus for async communication between channels and agent
 */
export class MessageBus {
  constructor() {
    this._inbound = new AsyncQueue();
    this._outbound = new AsyncQueue();
    this._running = false;
  }

  /**
   * Publish an inbound message (from channel to agent)
   * @param {object} msg - Inbound message
   */
  publishInbound(msg) {
    logger.debug(`Bus: inbound from ${msg.channel}:${msg.chatId}`);
    this._inbound.push(msg);
  }

  /**
   * Consume next inbound message (blocks until available or timeout)
   * @param {number} [timeoutMs=1000] - Timeout in ms
   * @returns {Promise<object>}
   */
  async consumeInbound(timeoutMs = 1000) {
    return this._inbound.pop(timeoutMs);
  }

  /**
   * Publish an outbound message (from agent to channel)
   * @param {object} msg - Outbound message
   */
  publishOutbound(msg) {
    logger.debug(`Bus: outbound to ${msg.channel}:${msg.chatId}`);
    this._outbound.push(msg);
  }

  /**
   * Consume next outbound message (blocks until available or timeout)
   * @param {number} [timeoutMs=1000] - Timeout in ms
   * @returns {Promise<object>}
   */
  async consumeOutbound(timeoutMs = 1000) {
    return this._outbound.pop(timeoutMs);
  }

  /**
   * Get inbound queue size
   * @returns {number}
   */
  get inboundSize() {
    return this._inbound.size;
  }

  /**
   * Get outbound queue size
   * @returns {number}
   */
  get outboundSize() {
    return this._outbound.size;
  }
}

// Singleton instance
let _bus = null;

/**
 * Get the message bus singleton
 * @returns {MessageBus}
 */
export function getMessageBus() {
  if (!_bus) {
    _bus = new MessageBus();
  }
  return _bus;
}

/**
 * Reset bus (for testing)
 */
export function resetMessageBus() {
  _bus = null;
}
