#!/usr/bin/env node
/**
 * Test script for cron functionality
 */
import { getConfig } from './config/index.js';
import { CronService } from './src/services/CronService.js';
import { AgentService } from './src/services/AgentService.js';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getWorkspacePath } from './src/utils/helpers.js';

const TEST_FILE = 'cron-test-output.txt';

async function testCron() {
  console.log('🧪 Testing Cron Service...\n');

  const config = getConfig();
  
  // Check if API key is configured
  if (!config.provider.apiKey) {
    console.error('❌ Error: OPENAI_API_KEY not configured in .env');
    console.error('Please set it first to test cron functionality');
    process.exit(1);
  }

  // Initialize services
  console.log('1. Initializing services...');
  const agentService = new AgentService(config);
  const cronService = new CronService(config, agentService);

  // Clean up any existing test file
  const testFilePath = join(getWorkspacePath(config.workspacePath), TEST_FILE);
  if (existsSync(testFilePath)) {
    unlinkSync(testFilePath);
    console.log('   Cleaned up existing test file');
  }

  // Start the cron service
  console.log('2. Starting cron service...');
  await cronService.start();

  // Add a job that will write to file
  const jobMessage = `Write the text "hello world" to the file ${TEST_FILE} in the workspace`;
  
  console.log('3. Adding cron job...');
  const job = cronService.addJob({
    name: 'Cron Test Job',
    schedule: { kind: 'cron', expr: '* * * * *' }, // Every minute
    message: jobMessage,
    enabled: true
  });
  
  console.log(`   Job ID: ${job.id}`);
  console.log(`   Schedule: Every minute`);
  console.log(`   Message: "${jobMessage}"`);

  // Wait a bit for the job to execute (cron runs every minute, but let's wait 65 seconds)
  console.log('\n4. Waiting for job to execute (up to 65 seconds)...');
  
  let attempts = 0;
  const maxAttempts = 13; // Check every 5 seconds for 65 seconds
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
    
    console.log(`   Check ${attempts}/${maxAttempts}...`);
    
    if (existsSync(testFilePath)) {
      const content = readFileSync(testFilePath, 'utf-8');
      console.log('\n✅ SUCCESS! File was created!');
      console.log(`   File path: ${testFilePath}`);
      console.log(`   Content: "${content}"`);
      
      // Clean up
      unlinkSync(testFilePath);
      cronService.stop();
      
      console.log('\n✅ Test completed successfully!');
      process.exit(0);
    }
  }

  console.log('\n❌ Timeout: File was not created');
  console.log('   This might be because the cron job needs more time to trigger');
  console.log('   or there was an issue with the agent processing');
  
  // Show job status
  const jobs = cronService.listJobs(true);
  const testJob = jobs.find(j => j.id === job.id);
  if (testJob) {
    console.log('\n   Job status:');
    console.log(`   - Enabled: ${testJob.enabled}`);
    console.log(`   - State: ${JSON.stringify(testJob.state)}`);
  }

  cronService.stop();
  process.exit(1);
}

testCron().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
