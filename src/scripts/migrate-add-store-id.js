const db = require('../config/database');

async function migrate() {
  console.log('🔧 Running migration: Add store_id to addresses table...');
  
  const conn = await db.getConnection();
  try {
    // Check if store_id column exists
    const [columns] = await conn.query("SHOW COLUMNS FROM addresses LIKE 'store_id'");
    
    if (columns.length === 0) {
      console.log('📝 Adding store_id column to addresses table...');
      await conn.query(`
        ALTER TABLE addresses 
        ADD COLUMN store_id char(36) DEFAULT NULL AFTER customer_id,
        ADD KEY idx_addresses_store (store_id),
        ADD CONSTRAINT fk_addresses_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
      `);
      console.log('✅ store_id column added successfully!');
    } else {
      console.log('✅ store_id column already exists');
    }
    
    // Also check if type enum has commercial
    const [typeCols] = await conn.query("SHOW COLUMNS FROM addresses LIKE 'type'");
    if (typeCols.length > 0 && !typeCols[0].Type.includes('commercial')) {
      console.log('📝 Updating type enum to include commercial...');
      await conn.query(`
        ALTER TABLE addresses 
        MODIFY COLUMN type enum('residential','commercial','delivery','event_venue') DEFAULT 'residential'
      `);
      console.log('✅ type enum updated!');
    } else {
      console.log('✅ type enum already includes commercial');
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));