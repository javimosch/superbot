# Cron Jobs

SuperBot includes a cron service that allows scheduling automated tasks to run at specified intervals or times.

## Overview

The cron system enables users to schedule messages that will be automatically sent to the agent for processing. This is useful for:
- Regular maintenance tasks
- Periodic data processing
- Automated reports
- Scheduled reminders
- Any repetitive AI-powered tasks

## Architecture

### Core Components

- **CronService** (`src/services/CronService.js`) - Main service managing scheduled jobs
- **AgentService** (`src/services/AgentService.js`) - Processes the scheduled messages
- **CLI Commands** (`cli.js`) - Command-line interface for managing jobs
- **Storage** - Jobs are persisted in `{workspace}/cron/jobs.json`

### Job Structure

Each cron job contains:
```javascript
{
  id: "unique_job_id",
  name: "Job Name",
  enabled: true,
  schedule: {
    kind: "cron",           // or "every" or "at"
    expr: "*/5 * * * *"     // cron expression
  },
  message: "Message to send to agent",
  createdAtMs: 1234567890,
  updatedAtMs: 1234567890,
  state: {
    lastRunAtMs: 1234567890,
    lastStatus: "ok",       // or "error"
    lastError: null
  }
}
```

## Schedule Types

### 1. Cron Expressions
Uses standard cron format: `minute hour day month weekday`

Examples:
- `* * * * *` - Every minute
- `*/5 * * * *` - Every 5 minutes
- `0 */2 * * *` - Every 2 hours
- `0 9 * * 1-5` - 9 AM on weekdays
- `0 0 1 * *` - First day of every month

### 2. Interval Scheduling
```javascript
{
  schedule: {
    kind: "every",
    everyMs: 300000  // 5 minutes in milliseconds
  }
}
```

### 3. One-time Scheduling
```javascript
{
  schedule: {
    kind: "at",
    atMs: 1234567890000,  // Timestamp
    deleteAfterRun: true
  }
}
```

## CLI Commands

### Add a Job
```bash
node cli.js cron add -s "*/5 * * * *" -m "Process daily reports" -n "Daily Report"
```

Options:
- `-s, --schedule <cron>` - Cron expression (required)
- `-m, --message <text>` - Message for agent (required)
- `-n, --name <text>` - Job name (optional, defaults to "Unnamed job")

### Remove a Job
```bash
node cli.js cron remove <job-id>
```

### Enable/Disable Jobs
```bash
node cli.js cron enable <job-id>
node cli.js cron disable <job-id>
```

### List Jobs
```bash
node cli.js cron list
```

## API Usage

### Creating a CronService
```javascript
import { CronService } from './src/services/CronService.js';
import { AgentService } from './src/services/AgentService.js';

const agentService = new AgentService(config);
const cronService = new CronService(config, agentService);

await cronService.start();
```

### Adding Jobs Programmatically
```javascript
const job = cronService.addJob({
  name: 'Data Cleanup',
  schedule: { kind: 'cron', expr: '0 2 * * *' }, // 2 AM daily
  message: 'Clean up old data files',
  enabled: true
});
```

### Managing Jobs
```javascript
// List all jobs
const jobs = cronService.listJobs(true);

// Remove a job
cronService.removeJob(job.id);

// Disable a job
cronService.enableJob(job.id, false);
```

## Execution Flow

1. **Scheduling**: When the CronService starts, it loads all enabled jobs and schedules them using `node-cron`
2. **Trigger**: At the scheduled time, the job executes
3. **Processing**: The job message is sent to `AgentService.processDirect()`
4. **Session**: Each job runs in a unique session: `cron:{job-id}`
5. **State Update**: Job status is updated with execution results
6. **Persistence**: Job states are saved to the JSON file

## Testing

The test script (`test-cron.js`) demonstrates the cron functionality:

```bash
node test-cron.js
```

This test:
1. Creates a job that writes "hello world" to a file
2. Waits for the job to execute (up to 65 seconds)
3. Verifies the file was created
4. Cleans up test artifacts

## Error Handling

- Invalid cron expressions are logged as warnings
- Job execution errors are captured in `job.state.lastError`
- Failed jobs don't prevent other jobs from running
- Service continues operating even if individual jobs fail

## Storage

Jobs are persisted in `{workspace}/cron/jobs.json`:
```json
{
  "version": 1,
  "jobs": [
    {
      "id": "abc12345",
      "name": "My Job",
      "enabled": true,
      "schedule": {
        "kind": "cron",
        "expr": "*/5 * * * *"
      },
      "message": "Do something",
      "createdAtMs": 1234567890,
      "updatedAtMs": 1234567890,
      "state": {
        "lastRunAtMs": 1234567890,
        "lastStatus": "ok",
        "lastError": null
      }
    }
  ]
}
```

## Security Considerations

- Jobs run with the same permissions as the main SuperBot process
- File operations are limited to the configured workspace
- No external network access unless explicitly requested by the agent
- Job messages are processed through the same security filters as regular messages

## Best Practices

1. **Use descriptive names** - Make jobs easily identifiable
2. **Set appropriate schedules** - Avoid overwhelming the system
3. **Handle errors gracefully** - Design messages that can fail safely
4. **Monitor job status** - Check `lastStatus` and `lastError` fields
5. **Test thoroughly** - Use the test script to verify new jobs
6. **Clean up old jobs** - Remove jobs that are no longer needed

## Troubleshooting

### Job Not Running
- Check if the job is enabled: `node cli.js cron list`
- Verify cron expression is valid
- Ensure the CronService is running
- Check logs for error messages

### Job Failing
- Review `job.state.lastError` for failure details
- Test the message manually: `node cli.js chat "your message"`
- Check if the agent has required permissions
- Verify workspace accessibility

### Performance Issues
- Avoid scheduling too many jobs at the same time
- Use longer intervals for resource-intensive tasks
- Monitor system resources during peak times
