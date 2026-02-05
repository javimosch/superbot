# Tools System

Superbot provides a set of built-in tools for the agent to interact with the environment.

## Available Tools

### Filesystem Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `read_file` | `path` | Read file contents |
| `write_file` | `path`, `content` | Write content to file |
| `edit_file` | `path`, `old_text`, `new_text` | Replace text in file |
| `list_dir` | `path` | List directory contents |

### Shell Tool

| Tool | Parameters | Description |
|------|------------|-------------|
| `exec` | `command`, `working_dir?` | Execute shell command |

**Safety Guards:**
- Blocks dangerous patterns (rm -rf, format, etc.)
- Optional workspace restriction
- Configurable timeout

### Web Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `web_search` | `query`, `count?` | Search with Brave API |
| `web_fetch` | `url`, `extractMode?`, `maxChars?` | Fetch URL content |

### Messaging Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `message` | `content`, `channel?`, `chat_id?` | Send message to user |
| `spawn` | `task`, `label?` | Start background subagent |

## Tool Schema

Tools are defined with JSON Schema parameters:

```javascript
class MyTool extends Tool {
  get name() { return 'my_tool'; }
  get description() { return 'Does something useful'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'First param' }
      },
      required: ['param1']
    };
  }

  async execute({ param1 }) {
    return 'Result string';
  }
}
```

## Tool Registry

Tools are registered in `ToolRegistry`:

```javascript
const registry = new ToolRegistry();
registry.register(new ReadFileTool());
registry.register(new ExecTool({ timeout: 60 }));

// Get OpenAI format definitions
const definitions = registry.getDefinitions();

// Execute a tool
const result = await registry.execute('read_file', { path: '/tmp/test.txt' });
```

## Files

- `src/tools/base.js` - Base Tool class
- `src/tools/registry.js` - ToolRegistry class
- `src/tools/filesystem.js` - File tools
- `src/tools/shell.js` - Exec tool
- `src/tools/web.js` - Web tools
- `src/tools/message.js` - Message tool
- `src/tools/spawn.js` - Spawn tool
