#!/usr/bin/env node

import { dbPool, supabaseAdmin } from './db/client.js';

console.log('🔍 DUAL DATABASE SCHEMA COMPARISON\n');
console.log('='.repeat(70));

async function checkNeonDatabase() {
  console.log('\n📊 NEON DATABASE (Primary - Serverless Postgres)');
  console.log('-'.repeat(70));
  
  const client = await dbPool.connect();
  
  try {
    // Check available schemas
    const schemas = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    
    console.log('\n📁 Available Schemas:');
    schemas.rows.forEach(s => console.log(`   - ${s.schema_name}`));
    
    // Check for API key tables in each schema
    console.log('\n🔑 API Key Related Tables:');
    
    for (const schema of schemas.rows) {
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
        AND (table_name LIKE '%api%key%' OR table_name IN ('stored_api_keys', 'api_key_projects'))
        ORDER BY table_name
      `, [schema.schema_name]);
      
      if (tables.rows.length > 0) {
        console.log(`\n   ${schema.schema_name}:`);
        for (const table of tables.rows) {
          const count = await client.query(`SELECT COUNT(*) FROM ${schema.schema_name}.${table.table_name}`);
          console.log(`      ✓ ${table.table_name} (${count.rows[0].count} records)`);
        }
      }
    }
    
    // Check specific schemas
    console.log('\n🔐 Security Service Schema (Neon):');
    try {
      const secProjects = await client.query('SELECT COUNT(*) FROM security_service.api_key_projects');
      const secKeys = await client.query('SELECT COUNT(*) FROM security_service.stored_api_keys');
      console.log(`   ✅ api_key_projects: ${secProjects.rows[0].count} projects`);
      console.log(`   ✅ stored_api_keys: ${secKeys.rows[0].count} keys`);
    } catch (e) {
      console.log(`   ❌ security_service schema not accessible: ${e.message}`);
    }
    
    console.log('\n📋 Public Schema (Neon):');
    try {
      const publicKeys = await client.query('SELECT COUNT(*) FROM public.api_keys WHERE is_active = true');
      console.log(`   ✅ api_keys: ${publicKeys.rows[0].count} active keys`);
    } catch (e) {
      console.log(`   ❌ public.api_keys not accessible: ${e.message}`);
    }
    
  } catch (error) {
    console.error('   ❌ Neon check failed:', error.message);
  } finally {
    client.release();
  }
}

async function checkSupabaseDatabase() {
  console.log('\n\n📊 SUPABASE DATABASE (Secondary - Managed Postgres)');
  console.log('-'.repeat(70));
  
  try {
    // Check public.api_keys
    console.log('\n📋 Public Schema (Supabase):');
    const { data: publicKeys, error: publicError } = await supabaseAdmin
      .from('api_keys')
      .select('id, name, is_active', { count: 'exact' })
      .limit(0);
    
    if (publicError) {
      console.log(`   ❌ public.api_keys: ${publicError.message}`);
    } else {
      console.log(`   ✅ public.api_keys exists`);
    }
    
    // Try to check security_service (this will likely fail in Supabase)
    console.log('\n🔐 Security Service Schema (Supabase):');
    try {
      const { data: secKeys, error: secError } = await supabaseAdmin
        .schema('security_service')
        .from('stored_api_keys')
        .select('id', { count: 'exact' })
        .limit(1);
      
      if (secError) {
        if (secError.message.includes('schema must be one of')) {
          console.log('   ⚠️  security_service schema NOT available in Supabase');
          console.log('   ℹ️  This is EXPECTED - Supabase restricts schema access');
        } else {
          console.log(`   ❌ security_service error: ${secError.message}`);
        }
      } else {
        console.log('   ✅ security_service.stored_api_keys accessible');
      }
    } catch (e) {
      console.log(`   ⚠️  security_service schema restricted: ${e.message}`);
    }
    
  } catch (error) {
    console.error('   ❌ Supabase check failed:', error.message);
  }
}

async function checkSyncMechanism() {
  console.log('\n\n🔄 CHECKING FOR DUAL-WRITE / SYNC MECHANISM');
  console.log('-'.repeat(70));
  
  const client = await dbPool.connect();
  
  try {
    // Check for triggers
    const triggers = await client.query(`
      SELECT 
        trigger_schema,
        trigger_name,
        event_object_table,
        action_statement
      FROM information_schema.triggers
      WHERE trigger_name LIKE '%sync%' OR action_statement LIKE '%sync%'
      ORDER BY event_object_table
    `);
    
    if (triggers.rows.length > 0) {
      console.log('\n✅ Found sync triggers:');
      triggers.rows.forEach(t => {
        console.log(`   - ${t.trigger_schema}.${t.trigger_name} on ${t.event_object_table}`);
      });
    } else {
      console.log('\n⚠️  No sync triggers found');
    }
    
    // Check for sync functions
    const syncFuncs = await client.query(`
      SELECT 
        routine_schema,
        routine_name,
        routine_type
      FROM information_schema.routines
      WHERE routine_name LIKE '%sync%'
        AND routine_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY routine_name
    `);
    
    if (syncFuncs.rows.length > 0) {
      console.log('\n✅ Found sync functions:');
      syncFuncs.rows.forEach(f => {
        console.log(`   - ${f.routine_schema}.${f.routine_name} (${f.routine_type})`);
      });
    } else {
      console.log('\n⚠️  No sync functions found');
    }
    
  } catch (error) {
    console.error('   ❌ Sync check failed:', error.message);
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await checkNeonDatabase();
    await checkSupabaseDatabase();
    await checkSyncMechanism();
    
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 ANALYSIS SUMMARY');
    console.log('='.repeat(70));
    console.log('\n✅ Neon Database: Primary data store (security_service + public schemas)');
    console.log('⚠️  Supabase Database: Limited to public schema only');
    console.log('ℹ️  Recommendation: Use Neon for security_service operations');
    console.log('\n');
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

main();
