#!/usr/bin/env node
/**
 * Quick script to check and apply Supabase migrations
 * Run with: node scripts/apply-supabase-migration.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL=https://<project-ref>.supabase.co
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL=https://<project-ref>.supabase.co
  process.exit(1);
}

console.log("🔗 Connecting to Supabase:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checkColumn() {
  console.log("\n📋 Checking if last_used_at column exists in api_keys...");

  const { data, error } = await supabase
    .from("api_keys")
    .select("last_used_at")
    .limit(1);

  if (error) {
    if (error.message.includes("last_used_at") || error.code === "42703") {
      console.log("❌ Column last_used_at does NOT exist");
      return false;
    }
    console.log("⚠️ Query error:", error.message);
    return null;
  }

  console.log("✅ Column last_used_at EXISTS");
  return true;
}

async function applyMigration() {
  console.log("\n🔧 Applying last_used_at migration...");

  // Use Supabase SQL RPC if available, otherwise we need direct DB access
  const migrationSql = `
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'api_keys'
              AND column_name = 'last_used_at'
        ) THEN
            ALTER TABLE public.api_keys
            ADD COLUMN last_used_at TIMESTAMPTZ;
            RAISE NOTICE 'Added last_used_at column to api_keys';
        ELSE
            RAISE NOTICE 'Column last_used_at already exists';
        END IF;
    END $$;
  `;

  // Try using the pg extension if available
  const { data, error } = await supabase.rpc("exec_sql", { sql: migrationSql });

  if (error) {
    console.log(
      "⚠️ Cannot execute SQL via RPC (exec_sql function not available)"
    );
    console.log("   Error:", error.message);
    console.log(
      "\n📝 Manual migration required. Run this SQL in Supabase Dashboard:"
    );
    console.log("─".repeat(60));
    console.log(migrationSql);
    console.log("─".repeat(60));
    return false;
  }

  console.log("✅ Migration applied successfully");
  return true;
}

async function main() {
  console.log("━".repeat(60));
  console.log("🚀 Supabase Migration Check & Apply");
  console.log("━".repeat(60));

  const columnExists = await checkColumn();

  if (columnExists === true) {
    console.log("\n✅ No migration needed - column already exists");
    process.exit(0);
  }

  if (columnExists === false) {
    const applied = await applyMigration();
    if (!applied) {
      process.exit(1);
    }
  }

  // Verify the migration worked
  const verified = await checkColumn();
  if (verified) {
    console.log("\n🎉 Migration verified successfully!");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
