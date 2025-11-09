import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Check if table exists
  const checkTable = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'api_keys'
    );
  `);
  
  if (checkTable.rows[0].exists) {
    console.log('⚠️  api_keys table already exists');
    
    // Check if key_prefix column exists
    const checkColumn = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'api_keys' AND column_name = 'key_prefix'
      );
    `);
    
    if (!checkColumn.rows[0].exists) {
      console.log('🔧 Adding missing key_prefix column...');
      await pool.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT NOT NULL DEFAULT 'unknown'`);
      console.log('✅ Column added');
    } else {
      console.log('✅ api_keys table is up to date');
    }
  } else {
    console.log('📝 Creating api_keys table...');
    const sql = fs.readFileSync('migrations/003_create_api_keys_table.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  }
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
