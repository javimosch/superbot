/**
 * Telegram channel using node-telegram-bot-api
 */
import TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';
import { BaseChannel } from './base.js';

/**
 * Convert markdown to Telegram-safe HTML
 */
function markdownToTelegramHtml(text) {
  if (!text) return '';

  // Protect code blocks
  const codeBlocks = [];
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  // Protect inline code
  const inlineCodes = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    inlineCodes.push(code);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  // Headers -> plain text
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');

  // Blockquotes -> plain text
  text = text.replace(/^>\s*(.*)$/gm, '$1');

  // Escape HTML
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic
  text = text.replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>');

  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Bullets
  text = text.replace(/^[-*]\s+/gm, '• ');

  // Restore inline code
  inlineCodes.forEach((code, i) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(`\x00IC${i}\x00`, `<code>${escaped}</code>`);
  });

  // Restore code blocks
  codeBlocks.forEach((code, i) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(`\x00CB${i}\x00`, `<pre><code>${escaped}</code></pre>`);
  });

  return text;
}

export class TelegramChannel extends BaseChannel {
  get name() { return 'telegram'; }

  /**
   * @param {object} config - Telegram config
   * @param {object} bus - Message bus
   */
  constructor(config, bus) {
    super(config, bus);
    this.bot = null;
    
    // Debug logging for configuration
    logger.debug('TelegramChannel: initializing with config');
    logger.debug(`Telegram: enabled=${!!config.enabled}`);
    logger.debug(`Telegram: hasToken=${!!config.token}`);
    logger.debug(`Telegram: allowFrom=${JSON.stringify(config.allowFrom || [])}`);
  }

  async start() {
    try {
      if (!this.config.token) {
        logger.error('Telegram bot token not configured');
        return;
      }

      logger.debug('Telegram: initializing bot...');
      this._running = true;
      this.bot = new TelegramBot(this.config.token, { polling: true });

      this.bot.on('message', async (msg) => {
        if (!msg.text) return;

        // Construct senderId with format "user_id|username" for compatibility
        let senderId = msg.from.id.toString();
        if (msg.from.username) {
          senderId = `${senderId}|${msg.from.username}`;
        }

        await this._handleMessage({
          senderId,
          chatId: msg.chat.id.toString(),
          content: msg.text,
          metadata: {
            firstName: msg.from.first_name,
            lastName: msg.from.last_name,
            username: msg.from.username
          }
        });
      });

      this.bot.on('polling_error', (err) => {
        logger.error(`Telegram polling error: ${err.message}`);
      });

      this.bot.on('error', (err) => {
        logger.error(`Telegram bot error: ${err.message}`);
      });

      logger.info('Telegram channel started');
    } catch (err) {
      logger.error(`Failed to start Telegram channel: ${err.message}`);
      this._running = false;
      this.bot = null;
    }
  }

  async stop() {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
    }
    this._running = false;
    logger.info('Telegram channel stopped');
  }

  async send(msg) {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const html = markdownToTelegramHtml(msg.content);
      await this.bot.sendMessage(msg.chatId, html, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error(`Telegram send error: ${err.message}`);
      // Fallback to plain text
      try {
        await this.bot.sendMessage(msg.chatId, msg.content);
      } catch (e) {
        logger.error(`Telegram fallback send error: ${e.message}`);
      }
    }
  }
}
