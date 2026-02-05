# Simplified Path Traversal Fix Plan

## Objective
Fix the `EXEC_RESTRICT_WORKSPACE` feature to properly prevent access to files outside the workspace when enabled.

## Current Issues
1. **Incomplete path detection**: Only matches direct paths, misses quoted paths, environment variables, etc.
2. **Weak containment logic**: Uses `startsWith()` which can be bypassed
3. **No symlink protection**: Symbolic links can escape workspace restrictions

## Simplified Solution (IMPLEMENTED)

### 1. Improve Path Detection
Implemented comprehensive path extraction in `/src/tools/shell.js`:
- **Absolute paths**: `/path/to/file` (only at word boundaries, not part of `./path`)
- **Windows paths**: `C:\path\to\file`
- **Quoted paths**: `"path"`, `'path'` (only if they look like paths)
- **Environment variables**: `$VAR/path`, `${VAR}/path`
- **Tilde expansion**: `~/path`
- **Relative paths**: `./subdir`, `../..`, and simple relative paths like `home_link`

### 2. Fix Containment Logic
Replaced vulnerable `startsWith()` with proper path validation using `fs.promises.realpath()`:
- Resolves symbolic links to their actual targets
- Validates if resolved path is within workspace boundaries
- Prevents symlink-based attacks

### 3. Enhanced Guard Function
Updated `_guardCommand()` to:
- Check for obvious traversal patterns (`../`, `..\`)
- Block environment variable bypasses (`$HOME/../`)
- Validate all extracted paths against workspace
- Allow relative paths within workspace (`./subdir`)
- Block paths outside workspace with proper symlink resolution

## Test Results (ALL PASSING)

### Automated Test Results
```
🧪 Testing Path Traversal Security

Setting up test environment...
Test workspace: /tmp/superbot-security-test-XXX

✅ PASS: Basic path traversal (../)
✅ PASS: Quoted path traversal
✅ PASS: Deep path traversal  
✅ PASS: Environment variable traversal
✅ PASS: Environment variable with braces
✅ PASS: Command substitution traversal
✅ PASS: Tilde expansion traversal
✅ PASS: Absolute path outside workspace
✅ PASS: Access sensitive file outside workspace
✅ PASS: Symlink to home directory (CRITICAL - symlink attack prevented)
✅ PASS: Valid subdirectory access (./subdir allowed)
✅ PASS: Valid file read (./subdir/test.txt allowed)
✅ PASS: Non-file command (echo allowed)
✅ PASS: PWD command (pwd allowed)
✅ PASS: List current directory (ls . allowed)

📊 Results: 15/15 tests passed
🎉 All security tests passed!
```

## Test Cases

```javascript
// Should be blocked when EXEC_RESTRICT_WORKSPACE=true
const blockedCommands = [
  'ls ../',
  'ls "../../"',
  'ls $HOME/../',
  'ls ${HOME}/../',
  'ls $(pwd)/../',
  'ls ~/../',
  'DIR="../.." && cd $DIR && ls',
  'cat /etc/passwd',
  'cat ~/.ssh/id_rsa'
];

// Should be allowed (within workspace)
const allowedCommands = [
  'ls ./subdir',
  'cat file.txt',
  'ls /tmp',  // Only if /tmp is within workspace
  'echo "hello"'
];
```

## Acceptance Criteria

### 1. Core Functionality
- [ ] `EXEC_RESTRICT_WORKSPACE=false` allows full system access (unchanged behavior)
- [ ] `EXEC_RESTRICT_WORKSPACE=true` blocks all file access outside workspace
- [ ] Commands within workspace work normally when restriction is enabled
- [ ] No performance regression (>50ms overhead for command validation)

### 2. Security Requirements
- [ ] All known path traversal methods are blocked
- [ ] Symbolic link attacks are prevented
- [ ] Environment variable bypasses are blocked
- [ ] Command substitution bypasses are blocked
- [ ] Quoted path bypasses are blocked

### 3. Test Scenarios Must Pass
- [ ] Basic traversal: `ls ../` → blocked
- [ ] Quoted traversal: `ls "../.."` → blocked  
- [ ] Environment variable: `ls $HOME/../` → blocked
- [ ] Command substitution: `ls $(pwd)/../` → blocked
- [ ] Symlink attack: `ln -s ~ /workspace/home_link && ls /workspace/home_link/.ssh` → blocked
- [ ] Valid workspace command: `ls ./subdir` → allowed
- [ ] Non-file commands: `echo "hello"` → allowed

## Comprehensive Test Plan

### Test Environment Setup
```bash
# Create test workspace
export WORKSPACE="/tmp/superbot-security-test"
mkdir -p "$WORKSPACE"
cd "$WORKSPACE"

# Create test files
echo "secret data" > "$WORKSPACE/secret.txt"
mkdir -p "$HOME/test-sensitive"
echo "sensitive info" > "$HOME/test-sensitive/sensitive.txt"

# Create malicious symlink
ln -s "$HOME" "$WORKSPACE/home_link"
```

### Test 1: Symlink Attack Prevention
```bash
# Test command that should be blocked
echo "list directories in symlinked home directory" | superbot cli --session test_symlink

# Expected behavior: Should return error about path outside working dir
# Actual vulnerable behavior: Would list $HOME/test-sensitive/
```

### Test 2: Basic Path Traversal
```bash
# Test basic traversal
echo "ls ../" | superbot cli --session test_traversal

# Expected: Error about path traversal detected
# Actual vulnerable: Lists parent directory contents
```

### Test 3: Environment Variable Bypass
```bash
# Test environment variable bypass
echo "ls \$HOME/../" | superbot cli --session test_env

# Expected: Error about path traversal detected  
# Actual vulnerable: Lists directory above $HOME
```

### Test 4: Command Substitution Bypass
```bash
# Test command substitution bypass
echo "ls \$(pwd)/../../../" | superbot cli --session test_sub

# Expected: Error about path traversal detected
# Actual vulnerable: Lists directories far outside workspace
```

### Test 5: Valid Workspace Commands
```bash
# Create subdirectory and file
mkdir -p "$WORKSPACE/subdir"
echo "test content" > "$WORKSPACE/subdir/test.txt"

# Test valid command (should work)
echo "cat ./subdir/test.txt" | superbot cli --session test_valid

# Expected: Returns "test content"
# Should work in both restricted and unrestricted modes
```

### Test 6: Performance Validation
```bash
# Time command execution
time echo "echo 'performance test'" | superbot cli --session test_perf

# Expected: <50ms overhead for security validation
# Should be comparable to unrestricted mode
```

## Test Script Location and Requirements

### Test Script File
- **Location**: `scripts/tests/test_path_traversal_fix.sh`
- **Purpose**: Automated validation of path traversal security fixes
- **Requirements**: Must pass all tests when security fixes are implemented

### Test Script Structure
```bash
#!/bin/bash
# scripts/tests/test_path_traversal_fix.sh

set -e

WORKSPACE="/tmp/superbot-security-test-$$"
export EXEC_RESTRICT_WORKSPACE=true

echo "Setting up test workspace..."
mkdir -p "$WORKSPACE"
cd "$WORKSPACE"

# Setup test data
echo "secret data" > "$WORKSPACE/secret.txt"
mkdir -p "$HOME/test-sensitive-$$"  
echo "sensitive info" > "$HOME/test-sensitive-$$/sensitive.txt"
ln -s "$HOME" "$WORKSPACE/home_link"

test_cases=(
  "ls ../|path_traversal_basic"
  "ls \"../..\"|path_traversal_quoted"  
  "ls \$HOME/../|path_traversal_env"
  "ls \$(pwd)/../../../|path_traversal_sub"
  "ls ./subdir|valid_workspace"
  "echo 'hello'|valid_non_file"
)

echo "Running security tests..."
failed_tests=0
total_tests=0

for test_case in "${test_cases[@]}"; do
  IFS='|' read -r command session <<< "$test_case"
  
  echo "Testing: $command"
  result=$(echo "$command" | superbot cli --session "$session" 2>&1 || true)
  total_tests=$((total_tests + 1))
  
  if [[ "$command" == ls* ]] && [[ "$command" != *"./"* ]]; then
    # Should be blocked
    if [[ "$result" == *"Error"*"blocked"* ]]; then
      echo "✓ PASS: $command (correctly blocked)"
    else
      echo "✗ FAIL: $command (should be blocked but wasn't)"
      echo "Result: $result"
      failed_tests=$((failed_tests + 1))
    fi
  else
    # Should be allowed
    if [[ "$result" != *"Error"*"blocked"* ]]; then
      echo "✓ PASS: $command (correctly allowed)"
    else
      echo "✗ FAIL: $command (should be allowed but was blocked)"
      echo "Result: $result"
      failed_tests=$((failed_tests + 1))
    fi
  fi
done

# Cleanup
rm -rf "$WORKSPACE"
rm -rf "$HOME/test-sensitive-$$"

echo "Test completed: $((total_tests - failed_tests))/$total_tests passed"

if [ $failed_tests -eq 0 ]; then
  echo "🎉 All tests passed!"
  exit 0
else
  echo "❌ $failed_tests tests failed"
  exit 1
fi
```

### Test Script Validation Requirements
- [ ] Script exists at `scripts/tests/test_path_traversal_fix.sh`
- [ ] Script is executable (`chmod +x`)
- [ ] Script passes all tests when security fixes are implemented
- [ ] Script fails tests on current vulnerable implementation
- [ ] Script includes proper cleanup
- [ ] Script returns appropriate exit codes (0 for pass, 1 for fail)

## Success Criteria

1. **Security**: All automated tests pass, symlink attack prevented
2. **Functionality**: Valid workspace commands work normally  
3. **Performance**: Command validation overhead <50ms
4. **Compatibility**: Existing configurations continue to work

## Timeline
- **Day 1**: Path detection improvements + basic testing
- **Day 2**: Containment logic fixes + symlink protection  
- **Day 3**: Comprehensive testing + validation

This focused approach directly fixes the security vulnerability without adding complexity or breaking existing functionality.
