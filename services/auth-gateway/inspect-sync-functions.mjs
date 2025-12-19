#!/usr/bin/env node

import { dbPool } from './db/client.js';

console.log('🔍 INSPECTING SYNC FUNCTIONS AND TRIGGERS\n');

async function main() {
  const client = await dbPool.connect();
  
  try {
    // Get sync function definitions
    console.log('📝 SYNC FUNCTION DEFINITIONS:');
    console.log('='.repeat(70));
    
    const funcs = await client.query(`
      SELECT 
        n.nspname as schema,
        p.proname as function_name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname LIKE '%sync%'
        AND n.nspname IN ('app_lanonasis_maas', 'app_onasis_core', 'public', 'security_service')
      ORDER BY n.nspname, p.proname
    `);
    
    for (const func of funcs.rows) {
      console.log(`\n📌 ${func.schema}.${func.function_name}:`);
      console.log('-'.repeat(70));
      console.log(func.definition);
      console.log('\n');
    }
    
    // Get trigger details
    console.log('\n🔗 TRIGGER DETAILS:');
    console.log('='.repeat(70));
    
    const triggers = await client.query(`
      SELECT 
        t.tgname as trigger_name,
        c.relname as table_name,
        n.nspname as schema_name,
        pg_get_triggerdef(t.oid) as trigger_definition,
        CASE t.tgtype::int & 2
          WHEN 0 THEN 'AFTER'
          ELSE 'BEFORE'
        END as timing,
        CASE t.tgtype::int & 28
          WHEN 4 THEN 'INSERT'
          WHEN 8 THEN 'DELETE'
          WHEN 16 THEN 'UPDATE'
          WHEN 20 THEN 'INSERT or UPDATE'
          ELSE 'OTHER'
        END as event
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE t.tgname LIKE '%sync%'
        AND n.nspname IN ('app_lanonasis_maas', 'app_onasis_core', 'public', 'security_service')
      ORDER BY n.nspname, c.relname, t.tgname
    `);
    
    for (const trigger of triggers.rows) {
      console.log(`\n🔔 ${trigger.schema_name}.${trigger.table_name}`);
      console.log(`   Trigger: ${trigger.trigger_name}`);
      console.log(`   Timing: ${trigger.timing} ${trigger.event}`);
      console.log(`   Definition: ${trigger.trigger_definition}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await dbPool.end();
  }
}

main();
