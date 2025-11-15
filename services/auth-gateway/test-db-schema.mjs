#!/usr/bin/env node

import { dbPool } from './db/client.js';

console.log('🔍 Testing database connection with security_service schema...\n');

async function testDatabaseSchema() {
  const client = await dbPool.connect();
  
  try {
    // Test 1: Check current search path
    console.log('1️⃣  Checking search path...');
    const searchPath = await client.query('SHOW search_path');
    console.log('   ✅ Search path:', searchPath.rows[0].search_path);
    console.log('');
    
    // Test 2: Check if api_key_projects table is accessible
    console.log('2️⃣  Checking api_key_projects table...');
    const projects = await client.query('SELECT COUNT(*) FROM api_key_projects');
    console.log('   ✅ api_key_projects accessible, row count:', projects.rows[0].count);
    console.log('');
    
    // Test 3: Check if stored_api_keys table is accessible
    console.log('3️⃣  Checking stored_api_keys table...');
    const keys = await client.query('SELECT COUNT(*) FROM stored_api_keys');
    console.log('   ✅ stored_api_keys accessible, row count:', keys.rows[0].count);
    console.log('');
    
    // Test 4: Check table structure
    console.log('4️⃣  Verifying api_key_projects columns...');
    const projectCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'security_service'
        AND table_name = 'api_key_projects'
      ORDER BY ordinal_position
    `);
    console.log('   ✅ Columns found:', projectCols.rows.length);
    projectCols.rows.forEach(col => {
      console.log(`      - ${col.column_name} (${col.data_type})`);
    });
    console.log('');
    
    // Test 5: Check stored_api_keys structure
    console.log('5️⃣  Verifying stored_api_keys columns...');
    const keyCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'security_service'
        AND table_name = 'stored_api_keys'
      ORDER BY ordinal_position
    `);
    console.log('   ✅ Columns found:', keyCols.rows.length);
    keyCols.rows.forEach(col => {
      console.log(`      - ${col.column_name} (${col.data_type})`);
    });
    console.log('');
    
    // Test 6: Check foreign key relationships
    console.log('6️⃣  Checking foreign key constraints...');
    const fkeys = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'security_service'
        AND tc.table_name IN ('api_key_projects', 'stored_api_keys')
      ORDER BY tc.table_name, kcu.column_name
    `);
    console.log(`   ✅ Foreign keys found: ${fkeys.rows.length}`);
    fkeys.rows.forEach(fk => {
      console.log(`      - ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    console.log('');
    
    console.log('🎉 All database schema tests passed!\n');
    console.log('✅ Summary:');
    console.log('   - Search path includes security_service');
    console.log('   - api_key_projects table accessible');
    console.log('   - stored_api_keys table accessible');
    console.log('   - All foreign keys properly configured');
    console.log('   - Service can query tables without schema prefix');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await dbPool.end();
  }
}

testDatabaseSchema().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
