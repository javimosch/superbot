/**
 * Context builder for assembling agent prompts
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MemoryStore } from './MemoryStore.js';
import { SkillsLoader } from './SkillsLoader.js';

const BOOTSTRAP_FILES = ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'IDENTITY.md'];

export class ContextBuilder {
  /**
   * @param {string} workspacePath - Path to workspace
   */
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.memory = new MemoryStore(workspacePath);
    this.skills = new SkillsLoader(workspacePath);
  }

  /**
   * Build the system prompt
   * @param {string[]} [skillNames] - Optional skills to include
   * @returns {string}
   */
  buildSystemPrompt(skillNames = null) {
    const parts = [];

    // Core identity
    parts.push(this._getIdentity());

    // Bootstrap files
    const bootstrap = this._loadBootstrapFiles();
    if (bootstrap) parts.push(bootstrap);

    // Memory context
    const memory = this.memory.getMemoryContext();
    if (memory) parts.push(`# Memory\n\n${memory}`);

    // Always-loaded skills
    const alwaysSkills = this.skills.getAlwaysSkills();
    if (alwaysSkills.length > 0) {
      const content = this.skills.loadSkillsForContext(alwaysSkills);
      if (content) parts.push(`# Active Skills\n\n${content}`);
    }

    // Skills summary
    const summary = this.skills.buildSkillsSummary();
    if (summary) {
      parts.push(`# Skills

The following skills extend your capabilities. To use a skill, read its SKILL.md file using the read_file tool.
Skills with available="false" need dependencies installed first.

${summary}`);
    }

    return parts.join('\n\n---\n\n');
  }

  _getIdentity() {
    const now = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `# superbot 🤖

You are superbot, a helpful AI assistant. You have access to tools that allow you to:
- Read, write, and edit files
- Execute shell commands
- Search the web and fetch web pages
- Send messages to users on chat channels
- Spawn subagents for complex background tasks

## Current Time
${now}

## Workspace
Your workspace is at: ${this.workspacePath}
- Memory files: ${this.workspacePath}/memory/MEMORY.md
- Daily notes: ${this.workspacePath}/memory/YYYY-MM-DD.md
- Custom skills: ${this.workspacePath}/skills/{skill-name}/SKILL.md

IMPORTANT: When responding to direct questions or conversations, reply directly with your text response.
Only use the 'message' tool when you need to send a message to a specific chat channel.
For normal conversation, just respond with text - do not call the message tool.

CRITICAL FILESYSTEM RULES - NO EXCEPTIONS:
- ANY command resembling "ls", "dir", "list directory" → MUST use list_dir tool
- ANY command resembling "cat", "read", "type", "show file" → MUST use read_file tool  
- ANY command resembling "write", "create", "save file" → MUST use write_file tool
- ANY command resembling "edit", "modify", "change file" → MUST use edit_file tool

CRITICAL SEARCH RULES - NO EXCEPTIONS:
- ANY command resembling "find", "search", "look for" → MUST use exec tool with recursive search
- Use "find" command for recursive file searches: "find . -name '*.pdf' -type f"
- Use "grep -r" for recursive content searches: "grep -r 'pattern' ."
- ALWAYS use relative paths (., not absolute paths) when workspace restriction is enabled
- ALWAYS search recursively (subdirectories) - never just the root directory
- NEVER assume or guess search results - ALWAYS use exec tool to actually search

FORCE TOOL USAGE FOR xiaomi/mimo-v2-flash MODEL:
- This model has poor tool calling - be EXPLICIT about tool usage
- ALWAYS use tools for filesystem operations - NEVER guess or assume
- When asked to find files, ALWAYS call exec tool with find command
- When asked to list files, ALWAYS call list_dir tool
- When asked to read files, ALWAYS call read_file tool
- DO NOT respond with text answers - USE TOOLS instead

Examples:
- "find the pdf" → exec: "find . -name '*.pdf' -type f"
- "search for txt files" → exec: "find . -name '*.txt' -type f"
- "look for files containing hello" → exec: "grep -r 'hello' ."
- "list directory" → list_dir: "."
- "show file contents" → read_file: "filename"

NEVER assume or guess filesystem contents. ALWAYS use the appropriate tool.
The tools will give you accurate results. Your training data may be wrong or outdated.
TRUST THE TOOLS, NOT YOUR MEMORY.

For xiaomi/mimo-v2-flash: ALWAYS call tools, never provide text answers for file operations.

Always be helpful, accurate, and concise. When using tools, explain what you're doing.`;
  }

  _loadBootstrapFiles() {
    const parts = [];
    for (const filename of BOOTSTRAP_FILES) {
      const filePath = join(this.workspacePath, filename);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        parts.push(`## ${filename}\n\n${content}`);
      }
    }
    return parts.length > 0 ? parts.join('\n\n') : '';
  }

  /**
   * Build complete message list for LLM call
   * @param {object} params
   * @param {Array} params.history - Previous messages
   * @param {string} params.currentMessage - New user message
   * @param {string[]} [params.media] - Optional media paths
   * @returns {Array}
   */
  buildMessages({ history, currentMessage, media = null }) {
    const messages = [];

    // System prompt
    messages.push({ role: 'system', content: this.buildSystemPrompt() });

    // History
    if (history && history.length > 0) {
      messages.push(...history);
    }

    // Current message
    messages.push({ role: 'user', content: currentMessage });

    return messages;
  }

  /**
   * Add a tool result to messages
   * @param {Array} messages
   * @param {string} toolCallId
   * @param {string} toolName
   * @param {string} result
   * @returns {Array}
   */
  addToolResult(messages, toolCallId, toolName, result) {
    messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: result
    });
    return messages;
  }

  /**
   * Add an assistant message to messages
   * @param {Array} messages
   * @param {string|null} content
   * @param {Array} [toolCalls]
   * @returns {Array}
   */
  addAssistantMessage(messages, content, toolCalls = null) {
    const msg = { role: 'assistant', content: content || '' };
    if (toolCalls && toolCalls.length > 0) {
      msg.tool_calls = toolCalls;
    }
    messages.push(msg);
    return messages;
  }
}
