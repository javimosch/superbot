#!/usr/bin/env node
/**
 * Superbot CLI
 * Command-line interface for interacting with the agent
 */
import { Command } from 'commander';
import { getConfig, saveConfig } from './config/index.js';
import { AgentService } from './src/services/AgentService.js';
import { ensureDir, getWorkspacePath } from './src/utils/helpers.js';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const VERSION = '0.1.0';
const LOGO = '🤖';

const program = new Command();

program
  .name('superbot')
  .description('AI agent framework')
  .version(VERSION);

/**
 * Onboard command - initialize workspace and config
 */
program
  .command('onboard')
  .description('Initialize superbot workspace and configuration')
  .option('-w, --workspace <path>', 'Workspace path')
  .action(async (options) => {
    console.log(`${LOGO} Superbot Onboarding\n`);

    const config = getConfig();
    const workspacePath = getWorkspacePath(options.workspace || config.workspacePath);

    console.log(`Workspace: ${workspacePath}`);

    // Create bootstrap files
    const bootstrapFiles = {
      'AGENTS.md': `# Agent Instructions\n\nYou are a helpful AI assistant.\n`,
      'SOUL.md': `# Personality\n\nBe helpful, accurate, and concise.\n`,
      'USER.md': `# User Context\n\nAdd information about yourself here.\n`
    };

    for (const [filename, content] of Object.entries(bootstrapFiles)) {
      const filePath = join(workspacePath, filename);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, content);
        console.log(`  Created ${filename}`);
      }
    }

    // Create memory directory
    ensureDir(join(workspacePath, 'memory'));
    console.log(`  Created memory/`);

    // Create skills directory
    ensureDir(join(workspacePath, 'skills'));
    console.log(`  Created skills/`);

    // Create sessions directory (under workspace for portability)
    ensureDir(join(workspacePath, 'sessions'));
    console.log(`  Created sessions/`);

    console.log(`\n${LOGO} Onboarding complete!`);
    console.log(`\nNext steps:`);
    console.log(`  1. Set OPENAI_API_KEY in .env`);
    console.log(`  2. Run: npm start`);
  });

/**
 * Agent command - direct interaction
 */
program
  .command('agent')
  .description('Interact with the agent directly')
  .option('-m, --message <text>', 'Single message to send')
  .option('-s, --session <id>', 'Session ID', 'cli:default')
  .action(async (options) => {
    const config = getConfig();

    if (!config.provider.apiKey) {
      console.error('Error: OPENAI_API_KEY not configured');
      process.exit(1);
    }

    const agentService = new AgentService(config);

    if (options.message) {
      // Single message mode
      const response = await agentService.processDirect(options.message, options.session);
      console.log(`\n${LOGO} ${response}`);
    } else {
      // Interactive mode
      console.log(`${LOGO} Interactive mode (Ctrl+C to exit)\n`);

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const prompt = () => {
        rl.question('You: ', async (input) => {
          if (!input.trim()) {
            prompt();
            return;
          }

          try {
            const response = await agentService.processDirect(input, options.session);
            console.log(`\n${LOGO} ${response}\n`);
          } catch (err) {
            console.error(`Error: ${err.message}`);
          }
          prompt();
        });
      };

      rl.on('close', () => {
        console.log('\nGoodbye!');
        process.exit(0);
      });

      prompt();
    }
  });

/**
 * Channels subcommands
 */
const channels = program.command('channels').description('Manage channels');

channels
  .command('status')
  .description('Show channel status')
  .action(() => {
    const config = getConfig();

    console.log('Channel Status\n');
    console.log(`Telegram: ${config.telegram.enabled ? '✓ enabled' : '✗ disabled'}`);
    console.log(`WhatsApp: ${config.whatsapp.enabled ? '✓ enabled' : '✗ disabled'}`);
  });

/**
 * Cron subcommands
 */
const cron = program.command('cron').description('Manage scheduled tasks');

cron
  .command('list')
  .description('List scheduled jobs')
  .action(async () => {
    const config = getConfig();
    const { CronService } = await import('./src/services/CronService.js');
    const cronService = new CronService(config, null);

    const jobs = cronService.listJobs();

    if (jobs.length === 0) {
      console.log('No scheduled jobs.');
      return;
    }

    console.log('Scheduled Jobs\n');
    for (const job of jobs) {
      const status = job.enabled ? 'enabled' : 'disabled';
      console.log(`  [${job.id}] ${job.name} - ${status}`);
    }
  });

program.parse();
