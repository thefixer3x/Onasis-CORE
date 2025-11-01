# WebSocket Stability Fixes & Comprehensive Error Resolution

**Date**: October 29, 2025  
**Branch**: `websocket-stability-fixes`  
**Issues**: WebSocket instability, TypeScript configuration errors, module resolution failures

## 🚨 Current Problem State

### WebSocket Connection Issues:

- ✅ **HTTP Transport**: Working perfectly
- ✅ **SSE Transport**: Real-time updates functional
- ✅ **STDIO Transport**: Local development ready
- ⚠️ **WebSocket Transport**: Connects but drops during memory operations

### Critical Error Categories:

#### 1. TypeScript Configuration Issues:

- `tsconfig.json` composite project references failing
- Previous `moduleResolution=node10` and `baseUrl` warnings (resolved; now using `moduleResolution: 'bundler'`)
- Missing package references (`memory-engine` not found)

#### 2. Module Resolution Failures:

- `@/` path imports not resolving across multiple files
- Missing module declarations for core services
- Supabase client configuration issues

#### 3. Type Definition Mismatches:

- `UnifiedUser` interface missing required properties (`userId`, `organizationId`, `plan`, `role`)
- Authentication middleware type conflicts
- Request handler type misalignments

#### 4. ESLint/TypeScript Warnings:

- Multiple `@typescript-eslint/no-explicit-any` warnings
- Forbidden non-null assertions
- Unsafe function types in transport manager

## 🏗️ MCP Architecture (Confirmed Working)

### Domain Separation:

- **api.lanonasis.com** → Netlify Functions (public lanonasis-maas repo)
- **mcp.lanonasis.com** → VPS nginx (private onasis-core infrastructure)
- **auth.lanonasis.com** → VPS nginx → PM2 auth service (port 4000, Neon DB)

### MCP Server Configuration (VPS: 168.231.74.29):

- **Location**: `/opt/lanonasis/mcp-core` (PM2 managed)
- **Ports**: 3001 (HTTP), 3002 (WebSocket), 3003 (SSE)
- **Current Status**: HTTP ✅, SSE ✅, STDIO ✅, WebSocket ⚠️

### Recent Infrastructure Fixes Applied:

1. **VPS nginx**: Fixed port routing (WebSocket→3002, SSE→3003)
2. **Netlify redirects**: Added proper proxy rules in `onasis-core/_redirects`
3. **PM2 config**: Added STDIO transport support
4. **Architecture cleanup**: Removed incorrect routing from public repo

## 🎯 Fix Strategy

### Phase 1: TypeScript Configuration Cleanup

1. Fix composite project references
2. Update deprecated TypeScript options
3. Resolve missing package declarations
4. Configure proper path mapping

### Phase 2: Module Resolution & Types

1. Fix `@/` import path resolution
2. Update `UnifiedUser` interface definition
3. Align authentication middleware types
4. Resolve Supabase client configuration

### Phase 3: WebSocket Stability

1. Investigate header upgrade negotiation issues
2. Implement connection retry logic with exponential backoff
3. Add proper error handling for dropped connections
4. Test memory operations under WebSocket transport

### Phase 4: Code Quality & Linting

1. Address ESLint warnings systematically
2. Replace `any` types with proper interfaces
3. Remove non-null assertions where possible
4. Clean up transport manager type safety

## 📊 Error Impact Analysis

### High Priority (Blocking):

- Module resolution failures preventing compilation
- TypeScript configuration errors
- WebSocket instability affecting core functionality

### Medium Priority (Quality):

- Type definition mismatches
- ESLint warnings
- Deprecated configuration options

### Low Priority (Maintenance):

- VS Code extension activation events
- Documentation link references
- Unused ESLint disable directives

## 🔧 Implementation Plan

1. **Start with TypeScript config fixes** (foundation)
2. **Resolve module imports** (enables compilation)
3. **Fix type definitions** (eliminates type errors)
4. **Address WebSocket stability** (core functionality)
5. **Clean up warnings** (code quality)

## 📈 Success Criteria

- [ ] All TypeScript compilation errors resolved
- [ ] WebSocket connections remain stable during operations
- [ ] Memory operations work across all transport protocols
- [ ] ESLint warnings reduced to zero
- [ ] All tests passing
- [ ] Documentation updated

## 🚀 Next Steps

1. Begin with `tsconfig.json` fixes across all packages
2. Update `UnifiedUser` interface definition
3. Test WebSocket header upgrade handling
4. Implement connection retry mechanisms
5. Comprehensive testing across all transport protocols

---

_This document serves as the master plan for resolving the comprehensive issues discovered during the 6-hour MCP architecture investigation session._
