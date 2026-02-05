#!/usr/bin/env node
/**
 * Quick fix to allow all Telegram users for testing
 */
import { getConfig, saveConfig } from '../../config/index.js';

async function allowAllTelegramUsers() {
  console.log('🔧 Configuring Telegram to allow all users...\n');

  const config = getConfig();
  
  console.log('Current Telegram config:');
  console.log(`   enabled: ${config.telegram.enabled}`);
  console.log(`   allowFrom: ${JSON.stringify(config.telegram.allowFrom || [])}`);
  console.log();

  // Update config to allow all users
  config.telegram.allowFrom = [];
  
  // Save the updated config
  saveConfig(config);
  
  console.log('✅ Updated Telegram config:');
  console.log(`   enabled: ${config.telegram.enabled}`);
  console.log(`   allowFrom: ${JSON.stringify(config.telegram.allowFrom || [])}`);
  console.log();
  
  console.log('📝 The bot will now accept messages from ANY Telegram user');
  console.log('🔄 Restart the server for changes to take effect');
  console.log();
  console.log('⚠️  SECURITY NOTE: This allows anyone to use your bot!');
  console.log('   After testing, update allowFrom with your actual user ID');
  console.log('   Find your user ID with @userinfobot on Telegram');
}

// Run the fix
allowAllTelegramUsers().catch(err => {
  console.error('❌ Failed to update config:', err.message);
  process.exit(1);
});
