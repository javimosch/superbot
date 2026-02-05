/**
 * Channel Service - manages Telegram and WhatsApp channels
 */
import logger from '../utils/logger.js';
import { TelegramChannel } from '../channels/telegram.js';
import { WhatsAppChannel } from '../channels/whatsapp.js';

export class ChannelService {
  /**
   * @param {object} config - Configuration object
   * @param {import('./AgentService.js').AgentService} agentService - Agent service
   */
  constructor(config, agentService) {
    this.config = config;
    this.agentService = agentService;
    this.bus = agentService.getMessageBus();
    this._channels = new Map();
    this._dispatcherRunning = false;
  }

  /**
   * Start all enabled channels
   */
  async startAll() {
    logger.info('ChannelService: starting channels...');

    if (this.config.telegram.enabled) {
      try {
        logger.debug('ChannelService: starting Telegram channel...');
        const telegram = new TelegramChannel(this.config.telegram, this.bus);
        await telegram.start();
        this._channels.set('telegram', telegram);
        logger.info('ChannelService: Telegram channel started successfully');
      } catch (err) {
        logger.error(`ChannelService: Failed to start Telegram channel: ${err.message}`);
      }
    }

    if (this.config.whatsapp.enabled) {
      try {
        logger.debug('ChannelService: starting WhatsApp channel...');
        const whatsapp = new WhatsAppChannel(this.config.whatsapp, this.bus);
        await whatsapp.start();
        this._channels.set('whatsapp', whatsapp);
        logger.info('ChannelService: WhatsApp channel started successfully');
      } catch (err) {
        logger.error(`ChannelService: Failed to start WhatsApp channel: ${err.message}`);
      }
    }

    // Start outbound dispatcher
    this._startDispatcher();
  }

  /**
   * Start the outbound message dispatcher
   */
  _startDispatcher() {
    this._dispatcherRunning = true;

    const dispatch = async () => {
      while (this._dispatcherRunning) {
        try {
          const msg = await this.bus.consumeOutbound(1000);
          await this._dispatchMessage(msg);
        } catch (err) {
          if (err.message !== 'Timeout') {
            logger.error(`Dispatcher error: ${err.message}`);
          }
        }
      }
    };

    // Run in background
    setImmediate(dispatch);
  }

  /**
   * Dispatch an outbound message to the appropriate channel
   * @param {object} msg - Outbound message
   */
  async _dispatchMessage(msg) {
    const channel = this._channels.get(msg.channel);
    if (channel) {
      try {
        await channel.send(msg);
      } catch (err) {
        logger.error(`Failed to send to ${msg.channel}: ${err.message}`);
      }
    } else {
      logger.debug(`No channel handler for: ${msg.channel}`);
    }
  }

  /**
   * Stop all channels
   */
  async stopAll() {
    logger.info('ChannelService: stopping channels...');
    this._dispatcherRunning = false;

    for (const [name, channel] of this._channels) {
      try {
        await channel.stop();
      } catch (err) {
        logger.error(`Error stopping ${name}: ${err.message}`);
      }
    }
    this._channels.clear();
  }

  /**
   * Get status of all channels
   * @returns {object}
   */
  getStatus() {
    const telegram = this._channels.get('telegram');
    const whatsapp = this._channels.get('whatsapp');

    return {
      telegram: {
        enabled: this.config.telegram.enabled,
        connected: telegram?._running || false
      },
      whatsapp: {
        enabled: this.config.whatsapp.enabled,
        connected: whatsapp?.isConnected || false
      }
    };
  }
}
