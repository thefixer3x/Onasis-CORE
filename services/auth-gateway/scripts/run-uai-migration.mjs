#!/usr/bin/env node
/**
 * UAI Migration Runner
 *
 * Runs the Universal Authentication Identifier (UAI) migration on Neon database.
 *
 * Usage:
 *   node scripts/run-uai-migration.mjs [--dry-run] [--verbose]
 *
 * Environment:
 *   NEON_DATABASE_URL=postgresql://user:pass@localhost:5432/db
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// Configuration
const MIGRATION_FILE = '015_universal_auth_identifier.sql';
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL || '';

if (!NEON_DATABASE_URL) {
  console.error('❌ Error: NEON_DATABASE_URL is required');
  process.exit(1);
}

async function runMigration() {
  console.log('🚀 UAI Migration Runner');
  console.log('========================');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE EXECUTION'}`);
  console.log('');

  // Read migration file
  const migrationPath = join(__dirname, '..', 'migrations', MIGRATION_FILE);
  let migrationSql;

  try {
    migrationSql = readFileSync(migrationPath, 'utf8');
    console.log(`✅ Read migration file: ${MIGRATION_FILE}`);
    if (verbose) {
      console.log(`   Size: ${migrationSql.length} bytes`);
    }
  } catch (error) {
    console.error(`❌ Error reading migration file: ${error.message}`);
    process.exit(1);
  }

  // Connect to database
  const pool = new Pool({
    connectionString: NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to Neon database');

    // Check if migration has already been run
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth_gateway'
        AND table_name = 'auth_identities'
      ) as exists
    `);

    if (checkResult.rows[0].exists) {
      console.log('');
      console.log('⚠️  Warning: auth_identities table already exists!');
      console.log('   This migration may have already been run.');

      // Show existing stats
      const statsResult = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM auth_gateway.auth_identities) as identities,
          (SELECT COUNT(*) FROM auth_gateway.auth_credentials) as credentials,
          (SELECT COUNT(*) FROM auth_gateway.identity_provenance) as provenance_events
      `);

      const stats = statsResult.rows[0];
      console.log('');
      console.log('   Current UAI Statistics:');
      console.log(`   - Identities: ${stats.identities}`);
      console.log(`   - Credentials: ${stats.credentials}`);
      console.log(`   - Provenance Events: ${stats.provenance_events}`);

      if (!dryRun) {
        console.log('');
        console.log('   Skipping migration (tables already exist).');
        client.release();
        await pool.end();
        return;
      }
    }

    if (dryRun) {
      console.log('');
      console.log('🔍 Dry run - analyzing migration...');
      console.log('');

      // Parse and display migration sections
      const sections = migrationSql.match(/-- =+\n-- (.+)\n-- =+/g) || [];
      console.log('   Migration sections:');
      sections.forEach((section, i) => {
        const title = section.match(/-- (.+)\n/)?.[1] || 'Unknown';
        console.log(`   ${i + 1}. ${title}`);
      });

      console.log('');
      console.log('✅ Dry run complete. No changes were made.');
      console.log('   Run without --dry-run to apply migration.');
    } else {
      console.log('');
      console.log('⚡ Executing migration...');

      const startTime = Date.now();
      await client.query(migrationSql);
      const duration = Date.now() - startTime;

      console.log(`✅ Migration completed in ${duration}ms`);

      // Verify migration
      console.log('');
      console.log('📊 Verifying migration...');

      const verifyResult = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM auth_gateway.auth_identities) as identities,
          (SELECT COUNT(*) FROM auth_gateway.auth_credentials) as credentials,
          (SELECT COUNT(*) FROM auth_gateway.user_accounts WHERE auth_id IS NOT NULL) as linked_users,
          (SELECT COUNT(*) FROM auth_gateway.user_accounts WHERE auth_id IS NULL) as unlinked_users
      `);

      const verify = verifyResult.rows[0];
      console.log('');
      console.log('   UAI Migration Results:');
      console.log(`   ✅ Identities created: ${verify.identities}`);
      console.log(`   ✅ Credentials created: ${verify.credentials}`);
      console.log(`   ✅ Users linked to UAI: ${verify.linked_users}`);
      console.log(`   ${verify.unlinked_users > 0 ? '⚠️' : '✅'} Users without UAI: ${verify.unlinked_users}`);
    }

    client.release();
  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    if (verbose) {
      console.error('');
      console.error('Full error:', error);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log('');
  console.log('🎉 Done!');
}

runMigration().catch(console.error);
