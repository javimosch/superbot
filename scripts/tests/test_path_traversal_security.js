#!/usr/bin/env node
/**
 * Unit test for path traversal security in shell tool
 * Tests the guard function directly without requiring API key
 */
import { ExecTool } from '../../src/tools/shell.js';
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_ID = Date.now();
const TEST_DIR = join(tmpdir(), `superbot-security-test-${TEST_ID}`);
const HOME_SENSITIVE_DIR = join(process.env.HOME || tmpdir(), `test-sensitive-${TEST_ID}`);

function setupTestEnvironment() {
  console.log('Setting up test environment...');
  
  // Create test workspace
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'subdir'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'secret.txt'), 'secret data');
  writeFileSync(join(TEST_DIR, 'subdir', 'test.txt'), 'test content');
  
  // Create sensitive directory outside workspace
  mkdirSync(HOME_SENSITIVE_DIR, { recursive: true });
  writeFileSync(join(HOME_SENSITIVE_DIR, 'sensitive.txt'), 'sensitive info');
  
  // Create malicious symlink
  try {
    symlinkSync(process.env.HOME || tmpdir(), join(TEST_DIR, 'home_link'));
  } catch (e) {
    console.warn('Could not create symlink (may require elevated permissions)');
  }
  
  console.log(`Test workspace: ${TEST_DIR}`);
  console.log(`Sensitive directory: ${HOME_SENSITIVE_DIR}`);
}

function cleanupTestEnvironment() {
  console.log('Cleaning up test environment...');
  try {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    if (existsSync(HOME_SENSITIVE_DIR)) {
      rmSync(HOME_SENSITIVE_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('Cleanup warning:', e.message);
  }
}

async function runTests() {
  console.log('🧪 Testing Path Traversal Security\n');
  
  setupTestEnvironment();
  
  // Create tool with workspace restriction enabled
  const tool = new ExecTool({
    workingDir: TEST_DIR,
    timeout: 60,
    restrictToWorkspace: true
  });
  
  const testCases = [
    // Should be BLOCKED
    { command: 'ls ../', shouldBlock: true, name: 'Basic path traversal (../)' },
    { command: 'ls "../.."', shouldBlock: true, name: 'Quoted path traversal' },
    { command: 'ls ../../etc', shouldBlock: true, name: 'Deep path traversal' },
    { command: 'ls $HOME/../', shouldBlock: true, name: 'Environment variable traversal' },
    { command: 'ls ${HOME}/../', shouldBlock: true, name: 'Environment variable with braces' },
    { command: 'ls $(pwd)/../../../', shouldBlock: true, name: 'Command substitution traversal' },
    { command: 'ls ~/../', shouldBlock: true, name: 'Tilde expansion traversal' },
    { command: 'cat /etc/passwd', shouldBlock: true, name: 'Absolute path outside workspace' },
    { command: `cat ${HOME_SENSITIVE_DIR}/sensitive.txt`, shouldBlock: true, name: 'Access sensitive file outside workspace' },
    { command: 'ls home_link/', shouldBlock: true, name: 'Symlink to home directory' },
    
    // Should be ALLOWED
    { command: 'ls ./subdir', shouldBlock: false, name: 'Valid subdirectory access' },
    { command: 'cat ./subdir/test.txt', shouldBlock: false, name: 'Valid file read' },
    { command: 'echo "hello"', shouldBlock: false, name: 'Non-file command' },
    { command: 'pwd', shouldBlock: false, name: 'PWD command' },
    { command: 'ls .', shouldBlock: false, name: 'List current directory' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const result = await tool._guardCommand(testCase.command, TEST_DIR);
    const isBlocked = result !== null;
    
    if (isBlocked === testCase.shouldBlock) {
      console.log(`✅ PASS: ${testCase.name}`);
      if (result) {
        console.log(`   Blocked: ${result}`);
      } else {
        console.log(`   Allowed: Command executed`);
      }
      passed++;
    } else {
      console.log(`❌ FAIL: ${testCase.name}`);
      console.log(`   Expected: ${testCase.shouldBlock ? 'BLOCKED' : 'ALLOWED'}`);
      console.log(`   Actual: ${isBlocked ? 'BLOCKED' : 'ALLOWED'}`);
      if (result) {
        console.log(`   Message: ${result}`);
      }
      failed++;
    }
    console.log('');
  }
  
  cleanupTestEnvironment();
  
  console.log(`\n📊 Results: ${passed}/${passed + failed} tests passed`);
  
  if (failed === 0) {
    console.log('🎉 All security tests passed!');
    process.exit(0);
  } else {
    console.log(`❌ ${failed} tests failed`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ Test error:', err.message);
  cleanupTestEnvironment();
  process.exit(1);
});
