# Path Traversal Security Improvement Plan

## Executive Summary

This plan addresses critical path traversal vulnerabilities in superbot's shell execution tool (`/src/tools/shell.js`). The current implementation can be bypassed, allowing unauthorized access to files outside the intended workspace when `EXEC_RESTRICT_WORKSPACE=true` is enabled.

## Problem Analysis

### Current Vulnerabilities

1. **Incomplete Path Detection**: Regex pattern `/[A-Za-z]:\\[^\s"']+|\/[^\s"']+/g` misses:
   - Quoted paths: `"../.."`, `'../..'`
   - Environment variables: `$HOME/../..`, `${HOME}/../..`
   - Command substitution: `$(pwd)/../..`
   - Tilde expansion: `~/../..`
   - Variable assignment: `DIR="../.." && cd $DIR`

2. **Weak Containment Logic**: `p.startsWith(cwdPath)` can be bypassed with:
   - Path traversal tricks
   - Symbolic links
   - Case sensitivity issues on case-insensitive filesystems

3. **Command Context Blindness**: Current implementation only looks at path strings, not command context.

## Proposed Solution

### 1. Enhanced Path Detection System

#### 1.1 Comprehensive Path Extraction
```javascript
// Replace current regex with comprehensive parser
function extractPaths(command) {
  const paths = new Set();
  
  // Direct paths (current approach)
  const directPaths = [...command.matchAll(/[A-Za-z]:\\[^\s"']+|\/[^\s"']+/g)];
  directPaths.forEach(match => paths.add(match[0]));
  
  // Quoted paths
  const quotedPaths = [...command.matchAll(/["']([^"']+)["']/g)];
  quotedPaths.forEach(match => paths.add(match[1]));
  
  // Environment variables (basic detection)
  const envPaths = [...command.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\/[^\s]*/g)];
  envPaths.forEach(match => paths.add(match[0]));
  
  // Tilde expansion
  const tildePaths = [...command.matchAll(/~\/[^\s]*/g)];
  tildePaths.forEach(match => paths.add(match[0]));
  
  return Array.from(paths);
}
```

#### 1.2 Path Resolution Engine
```javascript
async function resolvePathSafely(path, cwd) {
  try {
    // Use Node's path resolution with security checks
    const resolved = path.resolve(path);
    
    // Check for symbolic links that might escape workspace
    const realPath = await fs.promises.realpath(resolved);
    
    return {
      resolved,
      realPath,
      isSymlink: resolved !== realPath
    };
  } catch (error) {
    return null; // Invalid path
  }
}
```

### 2. Multi-Layered Security Validation

#### 2.1 Pre-Execution Analysis
```javascript
class SecurityAnalyzer {
  constructor(workspacePath) {
    this.workspaceRealPath = path.resolve(workspacePath);
  }
  
  async analyzeCommand(command, cwd) {
    const analysis = {
      allowed: true,
      violations: [],
      warnings: []
    };
    
    // 1. Check for dangerous patterns (existing deny list)
    if (this.hasDangerousPatterns(command)) {
      analysis.allowed = false;
      analysis.violations.push('Dangerous command pattern detected');
    }
    
    // 2. Extract and validate all paths
    const paths = extractPaths(command);
    for (const pathStr of paths) {
      const pathAnalysis = await this.analyzePath(pathStr, cwd);
      if (!pathAnalysis.allowed) {
        analysis.allowed = false;
        analysis.violations.push(...pathAnalysis.violations);
      }
      analysis.warnings.push(...pathAnalysis.warnings);
    }
    
    // 3. Command context analysis
    const contextAnalysis = this.analyzeCommandContext(command);
    analysis.violations.push(...contextAnalysis.violations);
    analysis.warnings.push(...contextAnalysis.warnings);
    
    return analysis;
  }
}
```

#### 2.2 Workspace Containment Rules
```javascript
async function isWithinWorkspace(resolvedPath, workspacePath) {
  try {
    // Get real paths (resolve symlinks)
    const realTarget = await fs.promises.realpath(resolvedPath);
    const realWorkspace = await fs.promises.realpath(workspacePath);
    
    // Check containment
    return realTarget.startsWith(realWorkspace + path.sep) || realTarget === realWorkspace;
  } catch (error) {
    return false;
  }
}
```

### 3. Configuration Enhancements

#### 3.1 Granular Security Levels
```javascript
// Add to config schema.js
exec: {
  timeout: 60,
  restrictToWorkspace: false,
  securityLevel: 'permissive', // 'permissive', 'strict', 'paranoid'
  allowedPaths: [], // Additional allowed paths outside workspace
  blockedCommands: [], // Additional blocked commands
  enableSymlinkProtection: true,
  maxPathDepth: 10 // Maximum directory depth
}
```

#### 3.2 Security Level Definitions
- **Permissive**: Current behavior with improved detection
- **Strict**: Workspace-only with comprehensive validation
- **Paranoid**: Workspace-only + explicit allowlist + audit logging

### 4. Implementation Strategy

#### Phase 1: Core Security Engine (Week 1)
1. Implement `SecurityAnalyzer` class
2. Create comprehensive path extraction
3. Add symbolic link protection
4. Implement workspace containment validation

#### Phase 2: Configuration Integration (Week 2)
1. Add new configuration options
2. Implement security levels
3. Update configuration validation
4. Add migration path for existing configs

#### Phase 3: Advanced Features (Week 3)
1. Command context analysis
2. Audit logging system
3. Security event reporting
4. Admin dashboard integration

#### Phase 4: Testing & Validation (Week 4)
1. Comprehensive security test suite
2. Penetration testing
3. Performance benchmarking
4. Documentation updates

### 5. Backward Compatibility

#### Migration Strategy
```javascript
// Maintain backward compatibility
const legacyRestrictToWorkspace = config.exec.restrictToWorkspace;
const newSecurityLevel = config.exec.securityLevel;

if (legacyRestrictToWorkspace && !newSecurityLevel) {
  // Auto-migrate to strict mode
  config.exec.securityLevel = 'strict';
}
```

### 6. Testing Strategy

#### 6.1 Security Test Cases
```javascript
describe('Path Traversal Protection', () => {
  const testCases = [
    // Basic traversal
    { cmd: 'ls ../', shouldBlock: true },
    { cmd: 'ls ../../', shouldBlock: true },
    
    // Quoted traversal
    { cmd: 'ls "../"', shouldBlock: true },
    { cmd: 'ls "../.."', shouldBlock: true },
    
    // Environment variables
    { cmd: 'ls $HOME/../', shouldBlock: true },
    { cmd: 'ls ${HOME}/../', shouldBlock: true },
    
    // Command substitution
    { cmd: 'ls $(pwd)/../', shouldBlock: true },
    
    // Tilde expansion
    { cmd: 'ls ~/../', shouldBlock: true },
    
    // Variable assignment
    { cmd: 'DIR="../.." && cd $DIR', shouldBlock: true },
    
    // Valid commands (should pass)
    { cmd: 'ls /tmp', shouldBlock: false }, // if /tmp in allowedPaths
    { cmd: 'ls ./subdir', shouldBlock: true },
    { cmd: 'cat file.txt', shouldBlock: true }
  ];
});
```

#### 6.2 Performance Testing
- Benchmark command validation overhead
- Test with large numbers of path extractions
- Validate memory usage doesn't increase significantly

### 7. Monitoring & Auditing

#### 7.1 Security Events
```javascript
class SecurityAuditor {
  logSecurityEvent(event) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      type: event.type, // 'PATH_VIOLATION', 'COMMAND_BLOCKED', 'SYMLINK_DETECTED'
      command: event.command,
      user: event.user,
      session: event.session,
      details: event.details
    };
    
    // Log to secure audit trail
    this.writeAuditLog(auditEntry);
  }
}
```

#### 7.2 Admin Dashboard Integration
- Security event viewer
- Configuration management
- Real-time alerts for violations

### 8. Documentation Updates

#### 8.1 Configuration Guide
- New security level explanations
- Migration instructions
- Best practices

#### 8.2 Security Documentation
- Threat model update
- Security considerations
- Incident response procedures

## Risk Assessment

### Implementation Risks
- **Breaking Changes**: Low (backward compatibility maintained)
- **Performance Impact**: Medium (additional validation overhead)
- **Complexity**: Medium (increased code complexity)

### Security Benefits
- **Eliminates Path Traversal**: High (comprehensive protection)
- **Prevents Symlink Attacks**: High (realpath validation)
- **Improves Auditability**: High (detailed logging)
- **Configurable Security**: High (multiple security levels)

## Success Metrics

1. **Security**: Zero successful path traversal attempts in penetration testing
2. **Performance**: Command validation overhead < 50ms
3. **Compatibility**: 100% backward compatibility for existing configurations
4. **Coverage**: 95%+ test coverage for security features

## Timeline

- **Week 1**: Core security engine implementation
- **Week 2**: Configuration integration
- **Week 3**: Advanced features and monitoring
- **Week 4**: Testing, documentation, and release

## Conclusion

This plan provides a comprehensive solution to the path traversal vulnerability while maintaining backward compatibility and providing configurable security levels. The multi-layered approach ensures robust protection against current and future attack vectors.
