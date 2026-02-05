#!/usr/bin/env node
/**
 * Test agent direct processing without the infinite loop
 */
import { getConfig } from '../../config/index.js';
import { AgentService } from '../../src/services/AgentService.js';

async function testAgentDirectProcessing() {
  console.log('🧪 Testing Agent Direct Processing...\n');

  const config = getConfig();
  
  // Check if API key is configured
  if (!config.provider.apiKey) {
    console.error('❌ Error: OPENAI_API_KEY not configured');
    process.exit(1);
  }

  // Create agent service (but don't start the loop)
  const agentService = new AgentService(config);
  console.log('✅ Agent service initialized');
  console.log();

  // Test direct processing (this is what CLI uses)
  console.log('2. Testing direct message processing...');
  console.log('⏳ This may take a few seconds...');
  
  try {
    const response = await agentService.processDirect(
      'Hello, this is a test message from Telegram user',
      'telegram:8292412122'
    );
    
    console.log('✅ Agent successfully processed message!');
    console.log();
    console.log('📤 Agent Response:');
    console.log(response);
    console.log();
    
    console.log('✅ CONCLUSION: Agent service is working correctly');
    console.log('   The issue is likely in the message bus integration');
    console.log('   or the agent loop not consuming messages properly');
    
  } catch (error) {
    console.error('❌ Agent processing failed:', error.message);
    console.log();
    console.log('Possible issues:');
    console.log('- Invalid API key');
    console.log('- Network connectivity issues');
    console.log('- Model not available');
    console.log('- Rate limiting');
  }
}

// Run the test
testAgentDirectProcessing().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
