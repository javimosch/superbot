/**
 * Skills loader for agent capabilities
 * Loads skills from workspace and built-in directories
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_SKILLS_DIR = join(__dirname, '..', '..', 'skills');

export class SkillsLoader {
  /**
   * @param {string} workspacePath - Path to workspace
   */
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.workspaceSkills = join(workspacePath, 'skills');
    this.builtinSkills = BUILTIN_SKILLS_DIR;
  }

  /**
   * List all available skills
   * @param {boolean} filterUnavailable - Filter out skills with unmet requirements
   * @returns {Array<{name: string, path: string, source: string}>}
   */
  listSkills(filterUnavailable = true) {
    const skills = [];

    // Workspace skills (highest priority)
    if (existsSync(this.workspaceSkills)) {
      for (const name of readdirSync(this.workspaceSkills)) {
        const skillDir = join(this.workspaceSkills, name);
        const skillFile = join(skillDir, 'SKILL.md');
        if (statSync(skillDir).isDirectory() && existsSync(skillFile)) {
          skills.push({ name, path: skillFile, source: 'workspace' });
        }
      }
    }

    // Built-in skills
    if (existsSync(this.builtinSkills)) {
      for (const name of readdirSync(this.builtinSkills)) {
        const skillDir = join(this.builtinSkills, name);
        const skillFile = join(skillDir, 'SKILL.md');
        if (statSync(skillDir).isDirectory() && existsSync(skillFile)) {
          if (!skills.some(s => s.name === name)) {
            skills.push({ name, path: skillFile, source: 'builtin' });
          }
        }
      }
    }

    if (filterUnavailable) {
      return skills.filter(s => this._checkRequirements(this._getSkillMeta(s.name)));
    }
    return skills;
  }

  /**
   * Load a skill by name
   * @param {string} name
   * @returns {string|null}
   */
  loadSkill(name) {
    const workspaceSkill = join(this.workspaceSkills, name, 'SKILL.md');
    if (existsSync(workspaceSkill)) {
      return readFileSync(workspaceSkill, 'utf-8');
    }

    const builtinSkill = join(this.builtinSkills, name, 'SKILL.md');
    if (existsSync(builtinSkill)) {
      return readFileSync(builtinSkill, 'utf-8');
    }

    return null;
  }

  /**
   * Load skills for context
   * @param {string[]} skillNames
   * @returns {string}
   */
  loadSkillsForContext(skillNames) {
    const parts = [];
    for (const name of skillNames) {
      const content = this.loadSkill(name);
      if (content) {
        const stripped = this._stripFrontmatter(content);
        parts.push(`### Skill: ${name}\n\n${stripped}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  /**
   * Build skills summary for context
   * @returns {string}
   */
  buildSkillsSummary() {
    const allSkills = this.listSkills(false);
    if (allSkills.length === 0) return '';

    const escapeXml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = ['<skills>'];
    for (const s of allSkills) {
      const desc = escapeXml(this._getSkillDescription(s.name));
      const meta = this._getSkillMeta(s.name);
      const available = this._checkRequirements(meta);

      lines.push(`  <skill available="${available}">`);
      lines.push(`    <name>${escapeXml(s.name)}</name>`);
      lines.push(`    <description>${desc}</description>`);
      lines.push(`    <location>${s.path}</location>`);
      if (!available) {
        const missing = this._getMissingRequirements(meta);
        if (missing) lines.push(`    <requires>${escapeXml(missing)}</requires>`);
      }
      lines.push('  </skill>');
    }
    lines.push('</skills>');
    return lines.join('\n');
  }

  /**
   * Get skills marked as always-loaded
   * @returns {string[]}
   */
  getAlwaysSkills() {
    const result = [];
    for (const s of this.listSkills(true)) {
      const meta = this.getSkillMetadata(s.name) || {};
      if (meta.always === 'true' || meta.always === true) {
        result.push(s.name);
      }
    }
    return result;
  }

  /**
   * Get skill metadata from frontmatter
   * @param {string} name
   * @returns {object|null}
   */
  getSkillMetadata(name) {
    const content = this.loadSkill(name);
    if (!content) return null;

    if (content.startsWith('---')) {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const metadata = {};
        for (const line of match[1].split('\n')) {
          if (line.includes(':')) {
            const [key, ...rest] = line.split(':');
            metadata[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
          }
        }
        return metadata;
      }
    }
    return null;
  }

  _stripFrontmatter(content) {
    if (content.startsWith('---')) {
      const match = content.match(/^---\n[\s\S]*?\n---\n/);
      if (match) return content.slice(match[0].length).trim();
    }
    return content;
  }

  _getSkillDescription(name) {
    const meta = this.getSkillMetadata(name);
    return meta?.description || name;
  }

  _getSkillMeta(name) {
    const meta = this.getSkillMetadata(name) || {};
    if (meta.metadata) {
      try {
        return JSON.parse(meta.metadata)?.superbot || {};
      } catch { return {}; }
    }
    return {};
  }

  _checkRequirements(skillMeta) {
    const requires = skillMeta?.requires || {};
    for (const bin of requires.bins || []) {
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' });
      } catch { return false; }
    }
    for (const env of requires.env || []) {
      if (!process.env[env]) return false;
    }
    return true;
  }

  _getMissingRequirements(skillMeta) {
    const missing = [];
    const requires = skillMeta?.requires || {};
    for (const bin of requires.bins || []) {
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' });
      } catch { missing.push(`CLI: ${bin}`); }
    }
    for (const env of requires.env || []) {
      if (!process.env[env]) missing.push(`ENV: ${env}`);
    }
    return missing.join(', ');
  }
}
