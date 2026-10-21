const db = require('../config/database');

/**
 * Migration: payment receipts feature.
 * Creates the receipts table (one receipt per issued payment document).
 * Idempotent: guarded by an information_schema check.
 */
async function migrate() {
  console.log('🔧 Running migration: receipts table...');

  const conn = await db.getConnection();
  try {
    const [dbRow] = await conn.query('SELECT DATABASE() AS db_name');
    const dbName = dbRow[0].db_name;

    const [rows] = await conn.query(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbName, 'receipts'],
    );

    if (rows.length === 0) {
      console.log('📝 Creating receipts table...');
      await conn.query(`
        CREATE TABLE receipts (
          id char(36) NOT NULL,
          payment_id char(36) NOT NULL,
          customer_id char(36) NOT NULL,
          amount decimal(10,2) NOT NULL,
          payment_method varchar(20) NOT NULL,
          issued_at datetime NOT NULL,
          created_by char(36) DEFAULT NULL,
          whatsapp_delivery_status enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
          created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY fk_receipts_payment (payment_id),
          KEY fk_receipts_customer (customer_id),
          KEY fk_receipts_created_by (created_by),
          CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE,
          CONSTRAINT fk_receipts_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
          CONSTRAINT fk_receipts_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ receipts table created!');
    } else {
      console.log('✅ receipts table already exists');
    }

    console.log('🎉 Migration finished.');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));
