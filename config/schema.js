/**
 * Configuration schema and defaults for superbot
 */
import { homedir } from 'os';
import { join } from 'path';

/**
 * Default configuration values
 */
export const defaultConfig = {
  // Server settings
  port: 3000,
  nodeEnv: 'development',

  // Workspace
  workspacePath: join(homedir(), '.superbot', 'workspace'),

  // LLM Provider
  provider: {
    apiKey: '',
    apiBase: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    fallbackModels: [] // Array of fallback models in priority order (left to right)
  },

  // Agent settings
  agent: {
    maxIterations: 20
  },

  // Exec tool settings
  exec: {
    timeout: 60,
    restrictToWorkspace: false
  },

  // Telegram channel
  telegram: {
    enabled: false,
    token: '',
    allowFrom: []
  },

  // WhatsApp channel
  whatsapp: {
    enabled: false,
    bridgePort: 3001
  },

  // Web tools
  web: {
    braveApiKey: ''
  },

  // Heartbeat service
  heartbeat: {
    enabled: true,
    intervalS: 1800
  },

  // Admin auth
  admin: {
    user: 'admin',
    pass: 'changeme'
  }
};

/**
 * Validate configuration object
 * @param {object} config - Config to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateConfig(config) {
  const errors = [];

  if (!config.provider?.apiKey && config.nodeEnv !== 'test') {
    errors.push('provider.apiKey is required');
  }

  if (config.agent?.maxIterations && config.agent.maxIterations < 1) {
    errors.push('agent.maxIterations must be >= 1');
  }

  if (config.exec?.timeout && config.exec.timeout < 1) {
    errors.push('exec.timeout must be >= 1');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
