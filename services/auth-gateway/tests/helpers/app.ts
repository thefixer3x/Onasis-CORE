// Live-integration test harness for auth-gateway.
//
// Imports the REAL app from src/index.ts. Relies on env being populated either
// by tests/setup.ts (placeholder values for mocked tests) or by a real
// .env.test loaded via dotenvx (live integration).
//
// Use only in tests gated behind RUN_AUTH_GATEWAY_INTEGRATION=true. Other
// tests in this directory mock src/config/env.js directly and should not use
// this helper.

import { createApp } from '../../src/index.ts';

export const app = createApp();
