#!/usr/bin/env node
/**
 * Test the complete message flow from Telegram to Agent and back
 */
import { getConfig } from '../../config/index.js';
import { TelegramChannel } from '../../src/channels/telegram.js';
import { getMessageBus } from '../../src/bus/MessageBus.js';
import { AgentService } from '../../src/services/AgentService.js';

async function testCompleteMessageFlow() {
  console.log('🔄 Testing Complete Message Flow...\n');

  const config = getConfig();
  
  // Check if API key is configured
  if (!config.provider.apiKey) {
    console.error('❌ Error: OPENAI_API_KEY not configured');
    process.exit(1);
  }

  // Get the singleton message bus
  const messageBus = getMessageBus();
  
  // Create agent service
  console.log('1. Initializing Agent Service...');
  const agentService = new AgentService(config);
  console.log('✅ Agent service initialized');
  
  // Start the agent loop to process messages
  await agentService.startLoop();
  console.log('✅ Agent loop started');
  console.log();

  // Log outbound messages (replies)
  const originalConsumeOutbound = messageBus.consumeOutbound.bind(messageBus);
  messageBus.consumeOutbound = async (timeout = 1000) => {
    try {
      const msg = await originalConsumeOutbound(timeout);
      if (msg) {
        console.log('📤 OUTBOUND MESSAGE (Reply):');
        console.log(`   Channel: ${msg.channel}`);
        console.log(`   Chat ID: ${msg.chatId}`);
        console.log(`   Content: ${msg.content}`);
        console.log();
      }
      return msg;
    } catch (error) {
      if (error.message !== 'Timeout') {
        console.log('⚠️  Outbound message error:', error.message);
      }
      throw error;
    }
  };

  // Log inbound messages
  const originalPublishInbound = messageBus.publishInbound.bind(messageBus);
  messageBus.publishInbound = (msg) => {
    console.log('📨 INCOMING MESSAGE:');
    console.log(`   Channel: ${msg.channel}`);
    console.log(`   Sender ID: ${msg.senderId}`);
    console.log(`   Chat ID: ${msg.chatId}`);
    console.log(`   Content: ${msg.content}`);
    console.log();
    
    // Process the message
    return originalPublishInbound(msg);
  };

  // Create Telegram channel
  const telegramChannel = new TelegramChannel(config.telegram, messageBus);
  
  console.log('2. Starting Telegram channel...');
  await telegramChannel.start();
  console.log('✅ Telegram channel started');
  console.log();
  
  console.log('3. Testing message flow...');
  console.log('   Send a message to your Telegram bot...');
  console.log('   Watch for: INCOMING -> PROCESSING -> OUTBOUND (reply)');
  console.log();
  console.log('⏳ Waiting for messages (Ctrl+C to stop)...');
  
  // Wait for messages
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 30000);
    process.on('SIGINT', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  
  // Cleanup
  agentService.stopLoop();
  await telegramChannel.stop();
  console.log('🛑 Test completed');
}

// Run the test
testCompleteMessageFlow().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
