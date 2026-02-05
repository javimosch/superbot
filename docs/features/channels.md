# Channels

Superbot supports multiple messaging channels for user interaction.

## Supported Channels

### Telegram

Uses `node-telegram-bot-api` with long polling.

**Configuration:**
```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your-bot-token
```

**Features:**
- Text message handling
- Markdown to Telegram HTML conversion
- Fallback to plain text on formatting errors

### WhatsApp

Connects to a Node.js bridge via WebSocket.

**Configuration:**
```env
WHATSAPP_ENABLED=true
WHATSAPP_BRIDGE_PORT=3001
```

**Bridge Protocol:**

Inbound messages from bridge:
```json
{ "type": "message", "id": "...", "sender": "123@s.whatsapp.net", "content": "Hello", "timestamp": 1234567890, "isGroup": false }
{ "type": "status", "status": "connected" }
{ "type": "qr", "qr": "..." }
```

Outbound commands to bridge:
```json
{ "type": "send", "to": "123@s.whatsapp.net", "text": "Hello back" }
```

## Channel Service

The `ChannelService` manages all channels:

1. **Start** - Initializes enabled channels
2. **Dispatcher** - Consumes outbound queue and routes to channels
3. **Stop** - Gracefully shuts down all channels

## Message Flow

```
[User] -> [Channel] -> [MessageBus.inbound] -> [AgentLoop]
                                                    |
[User] <- [Channel] <- [MessageBus.outbound] <- [Agent Response]
```

## Adding Custom Channels

Extend `BaseChannel`:

```javascript
import { BaseChannel } from './base.js';

class MyChannel extends BaseChannel {
  get name() { return 'mychannel'; }

  async start() {
    // Initialize channel
  }

  async stop() {
    // Cleanup
  }

  async send(msg) {
    // Send outbound message
  }
}
```

## Files

- `src/channels/base.js` - BaseChannel class
- `src/channels/telegram.js` - Telegram implementation
- `src/channels/whatsapp.js` - WhatsApp client
- `src/services/ChannelService.js` - Channel orchestration
- `bridge/` - WhatsApp bridge (TypeScript)
