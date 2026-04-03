#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const migrationsDirPath = path.join(currentDirPath, 'migrations');
const ledgerSchemaName = 'auth_gateway';
const ledgerTableName = 'schema_migrations';
const ledgerTableRef = `${ledgerSchemaName}.${ledgerTableName}`;
const baselineModeName = 'baseline';
const managedModeName = 'managed';
const migrationControlledModeName = 'migration-controlled';
const defaultAppliedBy =
  process.env.MIGRATION_APPLIED_BY ||
  process.env.USER ||
  process.env.LOGNAME ||
  (() => {
    try {
      return os.userInfo().username;
    } catch {
      return 'unknown';
    }
  })();

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(currentDirPath, '.env'),
  quiet: true,
});

export function deriveMigrationVersion(filename) {
  return filename.replace(/\.sql$/i, '');
}

export function hasExplicitTransactionControl(sql) {
  return (
    /(^|\n)\s*(BEGIN|START TRANSACTION)\b/im.test(sql) ||
    /(^|\n)\s*COMMIT\b/im.test(sql) ||
    /(^|\n)\s*ROLLBACK\b/im.test(sql)
  );
}

export function parseCliArgs(argv = []) {
  const args = [...argv];
  const parsed = {
    mode: 'apply',
    baselineFilenames: [],
    appliedBy: defaultAppliedBy,
    verbose: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--status') {
      parsed.mode = 'status';
      continue;
    }

    if (arg === '--baseline-existing') {
      parsed.mode = 'baseline-existing';
      continue;
    }

    if (arg === '--baseline') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--baseline requires a comma-separated list of migration filenames');
      }

      parsed.mode = 'baseline';
      parsed.baselineFilenames.push(
        ...value
          .split(',')
          .map((filename) => filename.trim())
          .filter(Boolean)
      );
      index += 1;
      continue;
    }

    if (arg === '--applied-by') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--applied-by requires a value');
      }
      parsed.appliedBy = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--verbose') {
      parsed.verbose = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      parsed.mode = 'help';
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

export function classifyMigrations(migrations, appliedRows) {
  const appliedByFilename = new Map(appliedRows.map((row) => [row.filename, row]));
  const applied = [];
  const pending = [];
  const drift = [];

  for (const migration of migrations) {
    const appliedRow = appliedByFilename.get(migration.filename);

    if (!appliedRow) {
      pending.push(migration);
      continue;
    }

    if (appliedRow.checksum !== migration.checksum) {
      drift.push({
        migration,
        appliedRow,
      });
      continue;
    }

    applied.push({
      migration,
      appliedRow,
    });
  }

  return { applied, pending, drift };
}

function printHelp() {
  console.log(`Usage: node run-migration.mjs [options]

Applies auth-gateway SQL migrations with a checksum ledger in ${ledgerTableRef}.

Options:
  --status               Show applied, pending, and drifted migrations
  --baseline <files>     Mark comma-separated migration filenames as already applied
  --baseline-existing    Mark every pending migration as already applied
  --applied-by <value>   Override the ledger applied_by value
  --verbose              Print extra migration detail
  --help, -h             Show this help message

Examples:
  node run-migration.mjs --status
  node run-migration.mjs
  node run-migration.mjs --baseline 003_create_api_keys_table.sql,006_api_key_management_service.sql
  node run-migration.mjs --baseline-existing --applied-by vps-baseline
`);
}

async function loadMigrations() {
  const directoryEntries = await fs.readdir(migrationsDirPath, { withFileTypes: true });
  const filenames = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const migrations = [];

  for (const filename of filenames) {
    const absolutePath = path.join(migrationsDirPath, filename);
    const sql = await fs.readFile(absolutePath, 'utf8');
    migrations.push({
      version: deriveMigrationVersion(filename),
      filename,
      absolutePath,
      sql,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      hasExplicitTransactionControl: hasExplicitTransactionControl(sql),
    });
  }

  return migrations;
}

async function ensureLedger(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${ledgerSchemaName}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${ledgerTableRef} (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by TEXT,
      execution_ms INTEGER,
      mode TEXT NOT NULL DEFAULT '${managedModeName}'
        CHECK (mode IN ('${managedModeName}', '${migrationControlledModeName}', '${baselineModeName}'))
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
      ON ${ledgerTableRef} (applied_at DESC)
  `);
}

async function getAppliedRows(client) {
  const result = await client.query(`
    SELECT version, filename, checksum, applied_at, applied_by, execution_ms, mode
    FROM ${ledgerTableRef}
    ORDER BY filename ASC
  `);
  return result.rows;
}

async function recordAppliedMigration(client, migration, options) {
  const { appliedBy, executionMs, mode } = options;
  await client.query(
    `
      INSERT INTO ${ledgerTableRef} (
        version,
        filename,
        checksum,
        applied_by,
        execution_ms,
        mode
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [migration.version, migration.filename, migration.checksum, appliedBy, executionMs, mode]
  );
}

function printMigrationSummary(summary) {
  console.log(`\nMigration ledger: ${ledgerTableRef}`);
  console.log(`Applied: ${summary.applied.length}`);
  console.log(`Pending: ${summary.pending.length}`);
  console.log(`Drift: ${summary.drift.length}`);

  if (summary.drift.length > 0) {
    console.log('\n⚠️  Drift detected:');
    for (const entry of summary.drift) {
      console.log(
        `  - ${entry.migration.filename}\n` +
          `    ledger checksum: ${entry.appliedRow.checksum}\n` +
          `    file checksum:   ${entry.migration.checksum}`
      );
    }
  }

  if (summary.pending.length > 0) {
    console.log('\nPending migrations:');
    for (const migration of summary.pending) {
      console.log(`  - ${migration.filename}`);
    }
  }
}

async function applyMigration(client, migration, appliedBy, verbose) {
  const startTime = Date.now();

  if (migration.hasExplicitTransactionControl) {
    if (verbose) {
      console.log(
        `ℹ️  ${migration.filename} manages its own transaction boundaries; recording ledger separately`
      );
    }

    await client.query(migration.sql);
    const executionMs = Date.now() - startTime;

    await client.query('BEGIN');
    try {
      await recordAppliedMigration(client, migration, {
        appliedBy,
        executionMs,
        mode: migrationControlledModeName,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    return executionMs;
  }

  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    const executionMs = Date.now() - startTime;
    await recordAppliedMigration(client, migration, {
      appliedBy,
      executionMs,
      mode: managedModeName,
    });
    await client.query('COMMIT');
    return executionMs;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function baselineMigrations(client, migrationsToBaseline, appliedBy) {
  if (migrationsToBaseline.length === 0) {
    console.log('✅ No migrations required baselining');
    return;
  }

  await client.query('BEGIN');
  try {
    for (const migration of migrationsToBaseline) {
      await recordAppliedMigration(client, migration, {
        appliedBy,
        executionMs: 0,
        mode: baselineModeName,
      });
      console.log(`🧾 Baselined ${migration.filename}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function selectBaselineTargets(parsedArgs, summary) {
  if (parsedArgs.mode === 'baseline-existing') {
    return summary.pending;
  }

  const pendingByFilename = new Map(summary.pending.map((migration) => [migration.filename, migration]));
  const selectedMigrations = [];
  const missingFilenames = [];

  for (const filename of parsedArgs.baselineFilenames) {
    const migration = pendingByFilename.get(filename);
    if (migration) {
      selectedMigrations.push(migration);
      continue;
    }
    missingFilenames.push(filename);
  }

  if (missingFilenames.length > 0) {
    throw new Error(
      `Cannot baseline unknown or already-applied migrations: ${missingFilenames.join(', ')}`
    );
  }

  return selectedMigrations;
}

export async function runCli(argv = process.argv.slice(2)) {
  let parsedArgs;
  let pool;
  let client;

  try {
    parsedArgs = parseCliArgs(argv);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    printHelp();
    return 1;
  }

  if (parsedArgs.mode === 'help') {
    printHelp();
    return 0;
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set');
    return 1;
  }

  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    client = await pool.connect();
    const migrations = await loadMigrations();
    await ensureLedger(client);
    const appliedRows = await getAppliedRows(client);
    const summary = classifyMigrations(migrations, appliedRows);

    if (parsedArgs.mode === 'status') {
      printMigrationSummary(summary);
      return summary.drift.length > 0 ? 1 : 0;
    }

    if (summary.drift.length > 0) {
      printMigrationSummary(summary);
      throw new Error('Refusing to continue while migration drift exists; use --status to inspect');
    }

    if (parsedArgs.mode === 'baseline-existing' || parsedArgs.mode === 'baseline') {
      const migrationsToBaseline = await selectBaselineTargets(parsedArgs, summary);
      console.log(`🧾 Recording ${migrationsToBaseline.length} migration(s) in the ledger without executing SQL...`);
      await baselineMigrations(client, migrationsToBaseline, parsedArgs.appliedBy);
      return 0;
    }

    if (summary.pending.length === 0) {
      console.log('✅ No pending migrations');
      return 0;
    }

    console.log(`🚀 Applying ${summary.pending.length} pending migration(s)...\n`);
    for (const migration of summary.pending) {
      console.log(`📝 Running migration: ${migration.filename}`);
      const executionMs = await applyMigration(client, migration, parsedArgs.appliedBy, parsedArgs.verbose);
      console.log(`✅ Migration ${migration.filename} applied successfully (${executionMs}ms)\n`);
    }

    console.log('🎉 All pending migrations completed successfully');
    return 0;
  } catch (error) {
    const message =
      error?.message === 'Invalid URL'
        ? 'DATABASE_URL is invalid or redacted; provide a full Postgres connection string'
        : error.message;
    console.error(`❌ Migration runner failed: ${message}`);
    if (parsedArgs?.verbose && error?.stack) {
      console.error(error.stack);
    }
    return 1;
  } finally {
    if (client) {
      client.release();
    }
    if (pool) {
      await pool.end();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
