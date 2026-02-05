#!/usr/bin/env node
/**
 * Simple test to check if agent service processes messages
 */
import { getConfig } from '../../config/index.js';
import { getMessageBus } from '../../src/bus/MessageBus.js';
import { AgentService } from '../../src/services/AgentService.js';

async function testAgentProcessing() {
  console.log('🧪 Testing Agent Message Processing...\n');

  const config = getConfig();
  
  // Check if API key is configured
  if (!config.provider.apiKey) {
    console.error('❌ Error: OPENAI_API_KEY not configured');
    process.exit(1);
  }

  // Get message bus and create agent service
  const messageBus = getMessageBus();
  const agentService = new AgentService(config);
  
  console.log('1. Starting agent loop...');
  await agentService.startLoop();
  console.log('✅ Agent loop started');
  console.log();

  // Monitor outbound messages
  let messageReceived = false;
  const originalConsumeOutbound = messageBus.consumeOutbound.bind(messageBus);
  messageBus.consumeOutbound = async (timeout = 5000) => {
    try {
      const msg = await originalConsumeOutbound(timeout);
      if (msg) {
        messageReceived = true;
        console.log('📤 AGENT REPLY GENERATED:');
        console.log(`   Channel: ${msg.channel}`);
        console.log(`   Chat ID: ${msg.chatId}`);
        console.log(`   Content: ${msg.content.substring(0, 100)}...`);
        console.log();
        return msg;
      }
    } catch (error) {
      if (error.message !== 'Timeout') {
        console.log('⚠️  Outbound error:', error.message);
      }
      throw error;
    }
  };

  // Send a test message directly to the agent
  console.log('2. Sending test message to agent...');
  const testMessage = {
    channel: 'telegram',
    senderId: '8292412122|JavitoHuman',
    chatId: '8292412122',
    content: 'Hello, this is a test message',
    metadata: { firstName: 'Javi', lastName: 'Annecy' }
  };

  messageBus.publishInbound(testMessage);
  console.log('✅ Test message sent to agent');
  console.log();

  console.log('3. Waiting for agent response...');
  console.log('⏳ Waiting up to 10 seconds...');

  // Wait for response
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (messageReceived) {
      console.log('✅ Agent successfully processed and replied to message!');
      break;
    }
    console.log(`   Waiting... (${i + 1}/10)`);
  }

  if (!messageReceived) {
    console.log('❌ No response received from agent');
    console.log();
    console.log('Possible issues:');
    console.log('- Agent loop not processing messages');
    console.log('- API key invalid or rate limited');
    console.log('- Message bus not properly connected');
    console.log('- Agent taking too long to respond');
  }

  // Cleanup
  agentService.stopLoop();
  console.log('🛑 Test completed');
}

// Run the test
testAgentProcessing().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
