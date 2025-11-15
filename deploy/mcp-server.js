#!/usr/bin/env node

/**
 * @deprecated Temporary wrapper to maintain compatibility with legacy MCP server workflows.
 *             Please invoke `deploy/mcp-core.js` directly.
 */

import { MCPCoreDeployment } from "./mcp-core.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  console.warn(
    "[deprecation] `apps/onasis-core/deploy/mcp-server.js` is deprecated. Use `apps/onasis-core/deploy/mcp-core.js` instead."
  );
  const deployment = new MCPCoreDeployment();
  deployment.deploy();
}

export { MCPCoreDeployment };
