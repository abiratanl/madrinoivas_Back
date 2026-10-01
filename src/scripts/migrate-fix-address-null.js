const db = require('../config/database');

async function migrate() {
  console.log('🔧 Running migration: Allow NULL for customer_id in addresses table...');
  
  const conn = await db.getConnection();
  try {
    // Check if customer_id allows NULL
    const [columns] = await conn.query("SHOW COLUMNS FROM addresses LIKE 'customer_id'");
    
    if (columns[0].Null === 'NO') {
      console.log('📝 Modifying customer_id to allow NULL...');
      await conn.query(`
        ALTER TABLE addresses 
        MODIFY COLUMN customer_id char(36) DEFAULT NULL
      `);
      console.log('✅ customer_id now allows NULL!');
    } else {
      console.log('✅ customer_id already allows NULL');
    }
    
    // Ensure store_id allows NULL
    const [storeCols] = await conn.query("SHOW COLUMNS FROM addresses LIKE 'store_id'");
    if (storeCols[0].Null === 'NO') {
      console.log('📝 Modifying store_id to allow NULL...');
      await conn.query(`
        ALTER TABLE addresses 
        MODIFY COLUMN store_id char(36) DEFAULT NULL
      `);
      console.log('✅ store_id now allows NULL!');
    } else {
      console.log('✅ store_id already allows NULL');
    }
    
    // Update type enum to include commercial if needed
    const [typeCols] = await conn.query("SHOW COLUMNS FROM addresses LIKE 'type'");
    if (typeCols.length > 0 && !typeCols[0].Type.includes('commercial')) {
      console.log('📝 Updating type enum...');
      await conn.query(`
        ALTER TABLE addresses 
        MODIFY COLUMN type enum('residential','commercial','delivery','event_venue','billing') DEFAULT 'residential'
      `);
      console.log('✅ type enum updated!');
    } else {
      console.log('✅ type enum OK');
    }
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));