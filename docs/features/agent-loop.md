# Agent Loop

The agent loop is the core processing engine of superbot.

## Overview

The `AgentLoop` class handles:
- Consuming inbound messages from the message bus
- Building context (system prompt, history, memory, skills)
- Calling the LLM provider
- Executing tool calls
- Publishing outbound responses

## Message Flow

1. **Inbound Message** arrives via message bus
2. **Session** loaded/created based on `sessionKey` (`channel:chatId`)
3. **Context Built** with system prompt, history, and current message
4. **LLM Called** with messages and tool definitions
5. **Tool Execution** if LLM returns tool calls
6. **Iteration** until no more tool calls or max iterations reached
7. **Response Published** to outbound queue
8. **Session Saved** with new messages

## Tool Calling

The agent supports OpenAI-compatible tool calling:

```javascript
{
  role: 'assistant',
  content: null,
  tool_calls: [{
    id: 'call_123',
    type: 'function',
    function: {
      name: 'read_file',
      arguments: '{"path": "/path/to/file"}'
    }
  }]
}
```

Tool results are added as:

```javascript
{
  role: 'tool',
  tool_call_id: 'call_123',
  name: 'read_file',
  content: 'file contents...'
}
```

## System Messages

Subagent results are injected as system messages:
- Channel: `system`
- ChatId: `{originChannel}:{originChatId}`

The agent parses this to route responses back to the original channel.

## Configuration

- `maxIterations`: Maximum tool call iterations (default: 20)
- `model`: LLM model to use
- `braveApiKey`: For web search tool
- `execConfig`: Shell execution settings

## Files

- `src/agent/AgentLoop.js` - Main loop implementation
- `src/agent/ContextBuilder.js` - Context assembly
- `src/agent/MemoryStore.js` - Memory management
- `src/agent/SkillsLoader.js` - Skills loading
- `src/agent/SubagentManager.js` - Background task execution
