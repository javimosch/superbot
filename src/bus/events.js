/**
 * Event types for the message bus
 */

/**
 * Create an inbound message
 * @param {object} params
 * @param {string} params.channel - Channel name (telegram, whatsapp, cli, system)
 * @param {string} params.senderId - User identifier
 * @param {string} params.chatId - Chat/channel identifier
 * @param {string} params.content - Message text
 * @param {string[]} [params.media] - Media URLs/paths
 * @param {object} [params.metadata] - Channel-specific data
 * @returns {object}
 */
export function createInboundMessage({
  channel,
  senderId,
  chatId,
  content,
  media = [],
  metadata = {}
}) {
  return {
    channel,
    senderId,
    chatId,
    content,
    media,
    metadata,
    timestamp: new Date(),
    get sessionKey() {
      return `${this.channel}:${this.chatId}`;
    }
  };
}

/**
 * Create an outbound message
 * @param {object} params
 * @param {string} params.channel - Target channel
 * @param {string} params.chatId - Target chat ID
 * @param {string} params.content - Message content
 * @param {string} [params.replyTo] - Message ID to reply to
 * @param {string[]} [params.media] - Media to attach
 * @param {object} [params.metadata] - Channel-specific data
 * @returns {object}
 */
export function createOutboundMessage({
  channel,
  chatId,
  content,
  replyTo = null,
  media = [],
  metadata = {}
}) {
  return {
    channel,
    chatId,
    content,
    replyTo,
    media,
    metadata,
    timestamp: new Date()
  };
}
