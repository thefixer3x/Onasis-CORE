const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL

(async () => {
  try {
    const sql = fs.readFileSync('migrations/003_create_api_keys_table.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Migration 003_create_api_keys_table.sql executed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
