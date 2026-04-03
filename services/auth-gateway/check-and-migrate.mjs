#!/usr/bin/env node
import { runCli } from './run-migration.mjs';

console.warn(
  '⚠️  check-and-migrate.mjs is deprecated; delegating to the canonical ledger-aware runner'
);

const exitCode = await runCli(process.argv.slice(2));
process.exit(exitCode);
