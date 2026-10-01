const db = require('../config/database');

async function migrate() {
  console.log('🔧 Running migration: Remove address_id from stores table...');
  
  const conn = await db.getConnection();
  try {
    // Check if address_id column exists
    const [columns] = await conn.query("SHOW COLUMNS FROM stores LIKE 'address_id'");
    
    if (columns.length > 0) {
      console.log('📝 Dropping foreign key constraint fk_stores_address...');
      await conn.query(`ALTER TABLE stores DROP FOREIGN KEY fk_stores_address`);
      
      console.log('📝 Removing address_id column from stores table...');
      await conn.query(`ALTER TABLE stores DROP COLUMN address_id`);
      console.log('✅ address_id column removed successfully!');
    } else {
      console.log('✅ address_id column already removed');
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));