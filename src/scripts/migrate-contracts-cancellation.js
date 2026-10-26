const db = require('../config/database');

/**
 * Migration: contract cancellation.
 *
 * Adds contracts.notes, used to record the cancellation reason. The status
 * enum already contains 'cancelled'; this migration also normalizes it for
 * databases created before that value existed.
 *
 * Idempotent: column and status enum are checked against information_schema.
 */
async function migrate() {
  console.log('🔧 Running migration: contract cancellation...');

  const conn = await db.getConnection();
  try {
    const [dbRow] = await conn.query('SELECT DATABASE() AS db_name');
    const dbName = dbRow[0].db_name;

    const [tables] = await conn.query(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbName, 'contracts'],
    );
    if (tables.length === 0) {
      throw new Error('The contracts table does not exist. Run migrate-contracts.js first.');
    }

    const [columns] = await conn.query(
      `SELECT 1
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'notes'`,
      [dbName],
    );

    if (columns.length === 0) {
      console.log('📝 Adding column contracts.notes...');
      await conn.query(
        "ALTER TABLE contracts ADD COLUMN notes text DEFAULT NULL COMMENT 'Cancellation reason / internal notes' AFTER signed_pdf_path",
      );
    } else {
      console.log('✅ Column contracts.notes already exists');
    }

    const [statusColumn] = await conn.query(
      `SELECT COLUMN_TYPE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'status'`,
      [dbName],
    );
    const statusType = statusColumn[0]?.COLUMN_TYPE || '';

    if (!statusType.includes("'cancelled'")) {
      console.log('📝 Adding cancelled to contracts.status enum...');
      await conn.query(
        "ALTER TABLE contracts MODIFY COLUMN status enum('draft','pending_signature','signed','cancelled') NOT NULL DEFAULT 'draft'",
      );
    } else {
      console.log('✅ contracts.status already supports cancelled');
    }

    console.log('🎉 Migration finished.');
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exitCode = 1;
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(process.exitCode || 0));
