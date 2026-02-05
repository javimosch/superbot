#!/usr/bin/env node
/**
 * Test script for Telegram message handling
 */
import { getConfig } from '../../config/index.js';
import { TelegramChannel } from '../../src/channels/telegram.js';
import { MessageBus } from '../../src/bus/MessageBus.js';

const TEST_TIMEOUT = 10000; // 10 seconds

async function testTelegramMessageHandling() {
  console.log('🧪 Testing Telegram Message Handling...\n');

  const config = getConfig();
  
  // Check configuration
  console.log('1. Configuration Check:');
  console.log(`   Telegram enabled: ${config.telegram.enabled}`);
  console.log(`   Has token: ${!!config.telegram.token}`);
  console.log(`   AllowFrom: ${JSON.stringify(config.telegram.allowFrom || [])}`);
  console.log();

  // Test allowFrom logic
  console.log('2. Testing allowFrom Logic:');
  
  // Create a mock message bus
  const mockBus = {
    publishInbound: (msg) => {
      console.log(`   ✅ Message published to bus: ${msg.content}`);
      console.log(`   From: ${msg.senderId}, Chat: ${msg.chatId}`);
      return Promise.resolve();
    }
  };

  // Create Telegram channel
  const telegramChannel = new TelegramChannel(config.telegram, mockBus);

  // Test different sender IDs
  const testCases = [
    { senderId: '8292412122', description: 'Exact match with allowFrom' },
    { senderId: '8292412122|testuser', description: 'User ID with username (exact match)' },
    { senderId: '123456789', description: 'Different user ID (should be blocked)' },
    { senderId: '123456789|otheruser', description: 'Different user ID with username (should be blocked)' },
    { senderId: 'testuser', description: 'Username only (should be blocked)' }
  ];

  for (const testCase of testCases) {
    const isAllowed = telegramChannel.isAllowed(testCase.senderId);
    console.log(`   ${isAllowed ? '✅' : '❌'} ${testCase.description}: ${testCase.senderId} -> ${isAllowed ? 'ALLOWED' : 'BLOCKED'}`);
  }
  console.log();

  // Test message handling with different sender IDs
  console.log('3. Testing Message Handling:');
  
  for (const testCase of testCases) {
    console.log(`   Testing: ${testCase.description}`);
    
    try {
      await telegramChannel._handleMessage({
        senderId: testCase.senderId,
        chatId: '123456',
        content: 'Test message',
        metadata: { firstName: 'Test', lastName: 'User' }
      });
      
      if (telegramChannel.isAllowed(testCase.senderId)) {
        console.log(`   ✅ Message processed successfully`);
      } else {
        console.log(`   ⚠️  Message blocked (expected)`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  console.log();

  // Test with empty allowFrom (should allow all)
  console.log('4. Testing with Empty allowFrom (should allow all):');
  
  const configWithEmptyAllowFrom = {
    ...config.telegram,
    allowFrom: []
  };
  
  const telegramChannelEmptyAllow = new TelegramChannel(configWithEmptyAllowFrom, mockBus);
  
  const testSenderId = '123456789|testuser';
  const isAllowedEmpty = telegramChannelEmptyAllow.isAllowed(testSenderId);
  console.log(`   Sender: ${testSenderId} -> ${isAllowedEmpty ? 'ALLOWED' : 'BLOCKED'}`);
  
  if (isAllowedEmpty) {
    await telegramChannelEmptyAllow._handleMessage({
      senderId: testSenderId,
      chatId: '123456',
      content: 'Test message with empty allowFrom',
      metadata: { firstName: 'Test', lastName: 'User' }
    });
    console.log(`   ✅ Message processed successfully with empty allowFrom`);
  }
  console.log();

  console.log('✅ Test completed!');
  console.log('\nNext steps:');
  console.log('1. If your messages are being blocked, update allowFrom in config.json');
  console.log('2. Find your Telegram user ID using @userinfobot');
  console.log('3. Add your user ID to the allowFrom list');
  console.log('4. Or set allowFrom to [] to allow all users');
}

// Run the test
testTelegramMessageHandling().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
