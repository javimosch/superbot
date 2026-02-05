/**
 * Configuration loader for superbot
 * Loads from environment variables with dotenv support
 */
import { config as dotenvConfig } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { defaultConfig, validateConfig } from './schema.js';
import { ensureDir } from '../src/utils/helpers.js';

// Load .env file based on MODE or ENV_FILE
const envFile = process.env.ENV_FILE || (process.env.MODE ? `.env.${process.env.MODE}` : '.env');
dotenvConfig({ path: envFile });

/**
 * Get config file path
 * @returns {string}
 */
function getConfigPath() {
  return join(homedir(), '.superbot', 'config.json');
}

/**
 * Load configuration from file
 * @returns {object|null}
 */
function loadConfigFile() {
  const path = getConfigPath();
  if (!existsSync(path)) return null;
  
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return data;
  } catch (e) {
    console.warn(`Failed to load config from ${path}: ${e.message}`);
    return null;
  }
}

/**
 * Save configuration to file
 * @param {object} config - Config to save
 */
export function saveConfig(config) {
  const path = getConfigPath();
  ensureDir(join(homedir(), '.superbot'));
  writeFileSync(path, JSON.stringify(config, null, 2));
}

/**
 * Parse boolean from env var
 * @param {string} val - Value to parse
 * @param {boolean} defaultVal - Default value
 * @returns {boolean}
 */
function parseBool(val, defaultVal = false) {
  if (val === undefined || val === '') return defaultVal;
  return val.toLowerCase() === 'true' || val === '1';
}

/**
 * Parse int from env var
 * @param {string} val - Value to parse
 * @param {number} defaultVal - Default value
 * @returns {number}
 */
function parseInt2(val, defaultVal) {
  if (val === undefined || val === '') return defaultVal;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Load configuration merging: defaults < config.json < env vars
 * @returns {object}
 */
export function loadConfig() {
  // Start with defaults
  let config = { ...defaultConfig };

  // Merge config file if exists
  const fileConfig = loadConfigFile();
  if (fileConfig) {
    config = mergeDeep(config, fileConfig);
  }

  // Override with env vars
  const env = process.env;

  config.port = parseInt2(env.PORT, config.port);
  config.nodeEnv = env.NODE_ENV || config.nodeEnv;
  config.workspacePath = env.WORKSPACE_PATH || config.workspacePath;

  // Provider
  config.provider = {
    apiKey: env.OPENAI_API_KEY || config.provider.apiKey,
    apiBase: env.OPENAI_API_BASE || config.provider.apiBase,
    defaultModel: env.DEFAULT_MODEL || config.provider.defaultModel
  };

  // Agent
  config.agent = {
    maxIterations: parseInt2(env.MAX_ITERATIONS, config.agent.maxIterations)
  };

  // Exec
  config.exec = {
    timeout: parseInt2(env.EXEC_TIMEOUT, config.exec.timeout),
    restrictToWorkspace: parseBool(env.EXEC_RESTRICT_WORKSPACE, config.exec.restrictToWorkspace)
  };

  // Telegram
  config.telegram = {
    enabled: parseBool(env.TELEGRAM_ENABLED, config.telegram.enabled),
    token: env.TELEGRAM_BOT_TOKEN || config.telegram.token
  };

  // WhatsApp
  config.whatsapp = {
    enabled: parseBool(env.WHATSAPP_ENABLED, config.whatsapp.enabled),
    bridgePort: parseInt2(env.WHATSAPP_BRIDGE_PORT, config.whatsapp.bridgePort)
  };

  // Web
  config.web = {
    braveApiKey: env.BRAVE_API_KEY || config.web.braveApiKey
  };

  // Heartbeat
  config.heartbeat = {
    enabled: parseBool(env.HEARTBEAT_ENABLED, config.heartbeat.enabled),
    intervalS: parseInt2(env.HEARTBEAT_INTERVAL_S, config.heartbeat.intervalS)
  };

  // Admin
  config.admin = {
    user: env.ADMIN_USER || config.admin.user,
    pass: env.ADMIN_PASS || config.admin.pass
  };

  return config;
}

/**
 * Deep merge two objects
 * @param {object} target - Target object
 * @param {object} source - Source object
 * @returns {object}
 */
function mergeDeep(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Export singleton config
let _config = null;

/**
 * Get the loaded configuration (singleton)
 * @returns {object}
 */
export function getConfig() {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Reset config cache (for testing)
 */
export function resetConfig() {
  _config = null;
}
