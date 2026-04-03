const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const migrations = [
      '003_create_api_keys_table.sql',
      '006_api_key_management_service.sql',
      '017_add_api_key_context.sql',
    ];

    for (const migration of migrations) {
      const sql = fs.readFileSync(`migrations/${migration}`, 'utf8');
      await pool.query(sql);
      console.log(`✅ Migration ${migration} executed successfully`);
    }
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
