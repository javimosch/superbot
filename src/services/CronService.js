/**
 * Cron Service - manages scheduled tasks
 */
import logger from '../utils/logger.js';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getWorkspacePath, ensureDir } from '../utils/helpers.js';
import cron from 'node-cron';

export class CronService {
  /**
   * @param {object} config - Configuration object
   * @param {import('./AgentService.js').AgentService|null} agentService - Agent service
   */
  constructor(config, agentService) {
    this.config = config;
    this.agentService = agentService;
    this.workspacePath = getWorkspacePath(config.workspacePath);
    this.storePath = join(this.workspacePath, 'cron', 'jobs.json');
    this._jobs = [];
    this._scheduledTasks = new Map();
    this._running = false;
  }

  /**
   * Start the cron service
   */
  async start() {
    this._loadJobs();
    this._running = true;
    this._scheduleAllJobs();
    logger.info(`CronService started with ${this._jobs.length} jobs`);
  }

  /**
   * Stop the cron service
   */
  stop() {
    this._running = false;
    for (const [id, task] of this._scheduledTasks) {
      task.stop();
    }
    this._scheduledTasks.clear();
    logger.info('CronService stopped');
  }

  /**
   * Schedule all enabled jobs
   */
  _scheduleAllJobs() {
    for (const job of this._jobs) {
      if (job.enabled) {
        this._scheduleJob(job);
      }
    }
  }

  /**
   * Schedule a single job
   */
  _scheduleJob(job) {
    if (this._scheduledTasks.has(job.id)) {
      this._scheduledTasks.get(job.id).stop();
    }

    if (job.schedule?.kind === 'cron' && job.schedule.expr) {
      if (cron.validate(job.schedule.expr)) {
        const task = cron.schedule(job.schedule.expr, () => this._executeJob(job));
        this._scheduledTasks.set(job.id, task);
      } else {
        logger.warn(`Invalid cron expression for job ${job.id}: ${job.schedule.expr}`);
      }
    } else if (job.schedule?.kind === 'every' && job.schedule.everyMs) {
      const intervalId = setInterval(() => this._executeJob(job), job.schedule.everyMs);
      this._scheduledTasks.set(job.id, { stop: () => clearInterval(intervalId) });
    }
  }

  /**
   * Execute a job
   */
  async _executeJob(job) {
    if (!this._running || !this.agentService) return;

    logger.info(`Cron: executing job '${job.name}' (${job.id})`);
    const startMs = Date.now();

    try {
      const response = await this.agentService.processDirect(
        job.payload?.message || job.message,
        `cron:${job.id}`
      );

      job.state = {
        ...job.state,
        lastRunAtMs: startMs,
        lastStatus: 'ok',
        lastError: null
      };
      logger.info(`Cron: job '${job.name}' completed`);

    } catch (err) {
      job.state = {
        ...job.state,
        lastRunAtMs: startMs,
        lastStatus: 'error',
        lastError: err.message
      };
      logger.error(`Cron: job '${job.name}' failed: ${err.message}`);
    }

    job.updatedAtMs = Date.now();
    this._saveJobs();

    // Handle one-shot jobs
    if (job.schedule?.kind === 'at' && job.deleteAfterRun) {
      this.removeJob(job.id);
    }
  }

  /**
   * List all jobs
   * @param {boolean} includeDisabled - Include disabled jobs
   * @returns {Array}
   */
  listJobs(includeDisabled = false) {
    this._loadJobs();
    if (includeDisabled) return this._jobs;
    return this._jobs.filter(j => j.enabled);
  }

  /**
   * Add a new job
   * @param {object} jobData - Job data
   * @returns {object}
   */
  addJob(jobData) {
    const job = {
      id: Math.random().toString(36).slice(2, 10),
      enabled: true,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      state: {},
      ...jobData
    };
    this._jobs.push(job);
    this._saveJobs();

    if (this._running && job.enabled) {
      this._scheduleJob(job);
    }

    logger.info(`Cron: added job '${job.name}' (${job.id})`);
    return job;
  }

  /**
   * Remove a job
   * @param {string} jobId - Job ID
   * @returns {boolean}
   */
  removeJob(jobId) {
    const task = this._scheduledTasks.get(jobId);
    if (task) {
      task.stop();
      this._scheduledTasks.delete(jobId);
    }

    const before = this._jobs.length;
    this._jobs = this._jobs.filter(j => j.id !== jobId);
    if (this._jobs.length < before) {
      this._saveJobs();
      logger.info(`Cron: removed job ${jobId}`);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable a job
   * @param {string} jobId
   * @param {boolean} enabled
   * @returns {object|null}
   */
  enableJob(jobId, enabled = true) {
    const job = this._jobs.find(j => j.id === jobId);
    if (!job) return null;

    job.enabled = enabled;
    job.updatedAtMs = Date.now();
    this._saveJobs();

    if (enabled && this._running) {
      this._scheduleJob(job);
    } else if (!enabled) {
      const task = this._scheduledTasks.get(jobId);
      if (task) {
        task.stop();
        this._scheduledTasks.delete(jobId);
      }
    }

    return job;
  }

  _loadJobs() {
    if (existsSync(this.storePath)) {
      try {
        const data = JSON.parse(readFileSync(this.storePath, 'utf-8'));
        this._jobs = data.jobs || [];
      } catch (e) {
        logger.warn(`Failed to load cron jobs: ${e.message}`);
        this._jobs = [];
      }
    }
  }

  _saveJobs() {
    ensureDir(join(this.workspacePath, 'cron'));
    writeFileSync(this.storePath, JSON.stringify({ version: 1, jobs: this._jobs }, null, 2));
  }
}
