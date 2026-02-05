/**
 * WhatsApp channel connecting to the Node.js bridge via WebSocket
 */
import WebSocket from 'ws';
import logger from '../utils/logger.js';
import { BaseChannel } from './base.js';

export class WhatsAppChannel extends BaseChannel {
  get name() { return 'whatsapp'; }

  /**
   * @param {object} config - WhatsApp config
   * @param {object} bus - Message bus
   */
  constructor(config, bus) {
    super(config, bus);
    this.ws = null;
    this.bridgeUrl = `ws://localhost:${config.bridgePort || 3001}`;
    this._reconnecting = false;
    this._connected = false;
  }

  async start() {
    this._running = true;
    await this._connect();
    logger.info('WhatsApp channel started');
  }

  async _connect() {
    if (!this._running) return;

    try {
      this.ws = new WebSocket(this.bridgeUrl);

      this.ws.on('open', () => {
        logger.info('WhatsApp bridge connected');
        this._connected = true;
        this._reconnecting = false;
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleBridgeMessage(msg);
        } catch (err) {
          logger.error(`WhatsApp message parse error: ${err.message}`);
        }
      });

      this.ws.on('close', () => {
        logger.info('WhatsApp bridge disconnected');
        this._connected = false;
        this._scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        logger.error(`WhatsApp WebSocket error: ${err.message}`);
        this._connected = false;
      });

    } catch (err) {
      logger.error(`WhatsApp connect error: ${err.message}`);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (!this._running || this._reconnecting) return;

    this._reconnecting = true;
    setTimeout(() => {
      this._reconnecting = false;
      if (this._running) {
        logger.info('WhatsApp reconnecting...');
        this._connect();
      }
    }, 5000);
  }

  _handleBridgeMessage(msg) {
    switch (msg.type) {
      case 'message':
        this._handleMessage({
          senderId: msg.sender,
          chatId: msg.sender,
          content: msg.content,
          metadata: {
            messageId: msg.id,
            timestamp: msg.timestamp,
            isGroup: msg.isGroup
          }
        });
        break;

      case 'status':
        logger.info(`WhatsApp status: ${msg.status}`);
        this._connected = msg.status === 'connected';
        break;

      case 'qr':
        logger.info('WhatsApp QR code received (scan required)');
        break;

      case 'error':
        logger.error(`WhatsApp bridge error: ${msg.error}`);
        break;
    }
  }

  async stop() {
    this._running = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    logger.info('WhatsApp channel stopped');
  }

  async send(msg) {
    if (!this.ws || !this._connected) {
      logger.warn('WhatsApp not connected, cannot send');
      return;
    }

    try {
      this.ws.send(JSON.stringify({
        type: 'send',
        to: msg.chatId,
        text: msg.content
      }));
    } catch (err) {
      logger.error(`WhatsApp send error: ${err.message}`);
    }
  }

  get isConnected() {
    return this._connected;
  }
}
