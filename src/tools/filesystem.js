/**
 * Filesystem tools: read_file, write_file, edit_file, list_dir
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { Tool } from './base.js';

/**
 * Expand ~ to home directory
 */
function expandPath(p) {
  return p.replace(/^~/, homedir());
}

export class ReadFileTool extends Tool {
  get name() { return 'read_file'; }
  get description() { return 'Read the complete contents of a file. ALWAYS use this tool for reading files instead of guessing or assuming file contents.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to read' }
      },
      required: ['path']
    };
  }

  async execute({ path }) {
    try {
      const filePath = resolve(expandPath(path));
      if (!existsSync(filePath)) {
        return `Error: File not found: ${path}`;
      }
      const stat = statSync(filePath);
      if (!stat.isFile()) {
        return `Error: Not a file: ${path}`;
      }
      return readFileSync(filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'EACCES') return `Error: Permission denied: ${path}`;
      return `Error reading file: ${err.message}`;
    }
  }
}

export class WriteFileTool extends Tool {
  get name() { return 'write_file'; }
  get description() { return 'Write content to a file. Creates parent directories if needed. ALWAYS use this tool for writing or creating files.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to write to' },
        content: { type: 'string', description: 'The content to write' }
      },
      required: ['path', 'content']
    };
  }

  async execute({ path, content }) {
    try {
      const filePath = resolve(expandPath(path));
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (err) {
      if (err.code === 'EACCES') return `Error: Permission denied: ${path}`;
      return `Error writing file: ${err.message}`;
    }
  }
}

export class EditFileTool extends Tool {
  get name() { return 'edit_file'; }
  get description() { return 'Edit a file by replacing old_text with new_text. The old_text must exist exactly in the file. ALWAYS use this tool for file modifications.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to edit' },
        old_text: { type: 'string', description: 'The exact text to find and replace' },
        new_text: { type: 'string', description: 'The text to replace with' }
      },
      required: ['path', 'old_text', 'new_text']
    };
  }

  async execute({ path, old_text, new_text }) {
    try {
      const filePath = resolve(expandPath(path));
      if (!existsSync(filePath)) {
        return `Error: File not found: ${path}`;
      }
      let content = readFileSync(filePath, 'utf-8');
      if (!content.includes(old_text)) {
        return 'Error: old_text not found in file. Make sure it matches exactly.';
      }
      const count = (content.match(new RegExp(old_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (count > 1) {
        return `Warning: old_text appears ${count} times. Please provide more context to make it unique.`;
      }
      content = content.replace(old_text, new_text);
      writeFileSync(filePath, content, 'utf-8');
      return `Successfully edited ${path}`;
    } catch (err) {
      if (err.code === 'EACCES') return `Error: Permission denied: ${path}`;
      return `Error editing file: ${err.message}`;
    }
  }
}

export class ListDirTool extends Tool {
  get name() { return 'list_dir'; }
  get description() { return 'List the complete contents of a directory. ALWAYS use this tool for directory listing commands like "ls", "dir", or when asked to show folder contents. Do not guess directory contents - use this tool to get accurate results.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory path to list' }
      },
      required: ['path']
    };
  }

  async execute({ path }) {
    try {
      const dirPath = resolve(expandPath(path));
      if (!existsSync(dirPath)) {
        return `Error: Directory not found: ${path}`;
      }
      const stat = statSync(dirPath);
      if (!stat.isDirectory()) {
        return `Error: Not a directory: ${path}`;
      }
      const items = readdirSync(dirPath).sort();
      if (items.length === 0) {
        return `Directory ${path} is empty`;
      }
      const lines = items.map(item => {
        const itemPath = resolve(dirPath, item);
        const isDir = statSync(itemPath).isDirectory();
        return `${isDir ? '📁' : '📄'} ${item}`;
      });
      return lines.join('\n');
    } catch (err) {
      if (err.code === 'EACCES') return `Error: Permission denied: ${path}`;
      return `Error listing directory: ${err.message}`;
    }
  }
}
