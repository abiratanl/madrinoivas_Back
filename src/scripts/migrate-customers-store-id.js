const db = require('../config/database');

/**
 * Migration: link customers to a store.
 * Adds customers.store_id (nullable) and backfills existing rows using the
 * most recent rental, then the customer's address/contact store when available.
 * Idempotent: the column/index/FK are guarded by information_schema checks.
 */
async function migrate() {
  console.log('Running migration: add store_id to customers...');

  const conn = await db.getConnection();
  try {
    const [dbRow] = await conn.query('SELECT DATABASE() AS db_name');
    const dbName = dbRow[0].db_name;

    const [columns] = await conn.query(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [dbName, 'customers', 'store_id'],
    );

    if (columns.length === 0) {
      console.log('Adding customers.store_id...');
      await conn.query(`
        ALTER TABLE customers
        ADD COLUMN store_id char(36) DEFAULT NULL AFTER user_id,
        ADD KEY idx_customers_store (store_id),
        ADD CONSTRAINT fk_customers_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE SET NULL
      `);
      console.log('customers.store_id added.');
    } else {
      console.log('customers.store_id already exists.');
    }

    const [rentalBackfill] = await conn.query(`
      UPDATE customers c
      JOIN (
        SELECT customer_id, store_id
        FROM (
          SELECT customer_id, store_id,
                 ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
          FROM rentals
        ) ranked
        WHERE rn = 1
      ) r ON r.customer_id = c.id
      SET c.store_id = r.store_id
      WHERE c.store_id IS NULL
    `);
    console.log(`Backfilled ${rentalBackfill.affectedRows} customer(s) from rentals.`);

    const [addressBackfill] = await conn.query(`
      UPDATE customers c
      JOIN (
        SELECT customer_id, MAX(store_id) AS store_id
        FROM addresses
        WHERE customer_id IS NOT NULL AND store_id IS NOT NULL
        GROUP BY customer_id
      ) a ON a.customer_id = c.id
      SET c.store_id = a.store_id
      WHERE c.store_id IS NULL
    `);
    console.log(`Backfilled ${addressBackfill.affectedRows} customer(s) from addresses.`);

    const [contactBackfill] = await conn.query(`
      UPDATE customers c
      JOIN (
        SELECT customer_id, MAX(store_id) AS store_id
        FROM contacts
        WHERE customer_id IS NOT NULL AND store_id IS NOT NULL
        GROUP BY customer_id
      ) ct ON ct.customer_id = c.id
      SET c.store_id = ct.store_id
      WHERE c.store_id IS NULL
    `);
    console.log(`Backfilled ${contactBackfill.affectedRows} customer(s) from contacts.`);

    console.log('Migration finished.');
  } catch (error) {
    console.error('Migration error:', error);
    process.exitCode = 1;
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(process.exitCode || 0));
