#!/usr/bin/env node
/**
 * Quick test to check if Telegram bot is receiving messages
 */
import { getConfig } from '../../config/index.js';
import { TelegramChannel } from '../../src/channels/telegram.js';
import { MessageBus } from '../../src/bus/MessageBus.js';

async function testTelegramReceiving() {
  console.log('🔍 Testing Telegram Message Reception...\n');

  const config = getConfig();
  
  // Create a message bus that logs all incoming messages
  const messageBus = new MessageBus();
  
  // Override publishInbound to log messages
  const originalPublishInbound = messageBus.publishInbound.bind(messageBus);
  messageBus.publishInbound = (msg) => {
    console.log('📨 INCOMING MESSAGE DETECTED:');
    console.log(`   Channel: ${msg.channel}`);
    console.log(`   Sender ID: ${msg.senderId}`);
    console.log(`   Chat ID: ${msg.chatId}`);
    console.log(`   Content: ${msg.content}`);
    console.log(`   Metadata: ${JSON.stringify(msg.metadata)}`);
    console.log();
    return originalPublishInbound(msg);
  };

  // Create and start Telegram channel
  const telegramChannel = new TelegramChannel(config.telegram, messageBus);
  
  console.log('1. Starting Telegram channel...');
  console.log(`   Token configured: ${!!config.telegram.token}`);
  console.log(`   AllowFrom: ${JSON.stringify(config.telegram.allowFrom || [])}`);
  console.log();
  
  try {
    await telegramChannel.start();
    console.log('✅ Telegram channel started successfully');
    console.log();
    console.log('2. Now send a message to your Telegram bot...');
    console.log('   The bot will log any incoming messages here');
    console.log('   Send any message and watch for logs above');
    console.log();
    console.log('⏳ Waiting for messages (Ctrl+C to stop)...');
    
    // Keep running for 30 seconds or until interrupted
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 30000);
      process.on('SIGINT', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    
  } catch (error) {
    console.error('❌ Failed to start Telegram channel:', error.message);
  } finally {
    await telegramChannel.stop();
    console.log('🛑 Telegram channel stopped');
  }
}

// Run the test
testTelegramReceiving().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
