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

  config.port = config.port || parseInt2(env.PORT);
  config.nodeEnv = config.nodeEnv || env.NODE_ENV;
  config.workspacePath = config.workspacePath || env.WORKSPACE_PATH;

  // Provider - config.json has priority
  config.provider = {
    apiKey: config.provider.apiKey || env.OPENAI_API_KEY,
    apiBase: config.provider.apiBase || env.OPENAI_API_BASE,
    defaultModel: config.provider.defaultModel || env.DEFAULT_MODEL,
    fallbackModels: (config.provider.fallbackModels && config.provider.fallbackModels.length > 0) 
      ? config.provider.fallbackModels 
      : (env.FALLBACK_MODELS ? env.FALLBACK_MODELS.split(',').map(s => s.trim()) : [])
  };

  // Agent - config.json has priority
  config.agent = {
    maxIterations: config.agent.maxIterations || parseInt2(env.MAX_ITERATIONS)
  };

  // Exec - config.json has priority
  config.exec = {
    timeout: config.exec.timeout || parseInt2(env.EXEC_TIMEOUT),
    restrictToWorkspace: config.exec.restrictToWorkspace !== undefined 
      ? config.exec.restrictToWorkspace 
      : parseBool(env.EXEC_RESTRICT_WORKSPACE)
  };

  // Telegram - config.json has priority
  config.telegram = {
    enabled: config.telegram.enabled !== undefined 
      ? config.telegram.enabled 
      : parseBool(env.TELEGRAM_ENABLED, false),
    token: config.telegram.token || env.TELEGRAM_BOT_TOKEN,
    allowFrom: (config.telegram.allowFrom && config.telegram.allowFrom.length > 0)
      ? config.telegram.allowFrom
      : (env.TELEGRAM_ALLOW_FROM ? env.TELEGRAM_ALLOW_FROM.split(',').map(s => s.trim()) : [])
  };

  // WhatsApp - config.json has priority
  config.whatsapp = {
    enabled: config.whatsapp.enabled !== undefined 
      ? config.whatsapp.enabled 
      : parseBool(env.WHATSAPP_ENABLED),
    bridgePort: config.whatsapp.bridgePort || parseInt2(env.WHATSAPP_BRIDGE_PORT)
  };

  // Web - config.json has priority
  config.web = {
    braveApiKey: config.web.braveApiKey || env.BRAVE_API_KEY
  };

  // Heartbeat - config.json has priority
  config.heartbeat = {
    enabled: config.heartbeat.enabled !== undefined 
      ? config.heartbeat.enabled 
      : parseBool(env.HEARTBEAT_ENABLED),
    intervalS: config.heartbeat.intervalS || parseInt2(env.HEARTBEAT_INTERVAL_S)
  };

  // Admin - config.json has priority
  config.admin = {
    user: config.admin.user || env.ADMIN_USER,
    pass: config.admin.pass || env.ADMIN_PASS
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
