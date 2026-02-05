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

# Create subdirectory for valid tests
mkdir -p "$WORKSPACE/subdir"
echo "test content" > "$WORKSPACE/subdir/test.txt"

test_cases=(
  "ls ../|path_traversal_basic"
  "ls \"../..\"|path_traversal_quoted"  
  "ls \$HOME/../|path_traversal_env"
  "ls \$(pwd)/../../../|path_traversal_sub"
  "ls ~/../|path_traversal_tilde"
  "ls \$\{HOME\}/../|path_traversal_env_braces"
  "ls ./subdir|valid_workspace"
  "cat ./subdir/test.txt|valid_file_read"
  "echo 'hello'|valid_non_file"
)

echo "Running security tests..."
failed_tests=0
total_tests=0

for test_case in "${test_cases[@]}"; do
  IFS='|' read -r command session <<< "$test_case"
  
  echo "Testing: $command"
  result=$(echo "$command" | superbot agent -m "$command" -s "$session" 2>&1 || true)
  total_tests=$((total_tests + 1))
  
  # Determine if this should be blocked or allowed
  should_block=false
  if [[ "$command" == ls* ]] && [[ "$command" != *"./"* ]]; then
    should_block=true
  elif [[ "$command" == ls* ]] && [[ "$command" == *"../"* ]]; then
    should_block=true
  elif [[ "$command" == cat* ]] && [[ "$command" != *"./"* ]]; then
    should_block=true
  fi
  
  if [ "$should_block" = true ]; then
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

# Test symlink attack specifically
echo "Testing symlink attack..."
symlink_result=$(echo "ls home_link/test-sensitive-$$" | superbot agent -m "ls home_link/test-sensitive-$$" -s test_symlink 2>&1 || true)
total_tests=$((total_tests + 1))

if [[ "$symlink_result" == *"Error"*"blocked"* ]]; then
  echo "✓ PASS: Symlink attack (correctly blocked)"
else
  echo "✗ FAIL: Symlink attack (should be blocked but wasn't)"
  echo "Result: $symlink_result"
  failed_tests=$((failed_tests + 1))
fi

# Cleanup
rm -rf "$WORKSPACE"
rm -rf "$HOME/test-sensitive-$$"

echo ""
echo "Test completed: $((total_tests - failed_tests))/$total_tests passed"

if [ $failed_tests -eq 0 ]; then
  echo "🎉 All tests passed!"
  exit 0
else
  echo "❌ $failed_tests tests failed"
  exit 1
fi
