const db = require('../config/database');

/**
 * Migration: sequential contract numbers.
 *
 * Adds contracts.contract_number and a unique index. The unique index is the
 * database-level guarantee that two attendants can never persist the same
 * number, even if a concurrent transaction bypasses the FOR UPDATE lock.
 *
 * Idempotent: column and index are checked against information_schema.
 */
async function migrate() {
  console.log('🔧 Running migration: sequential contract numbers...');

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
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'contract_number'`,
      [dbName],
    );

    if (columns.length === 0) {
      console.log('📝 Adding column contracts.contract_number...');
      await conn.query(
        "ALTER TABLE contracts ADD COLUMN contract_number varchar(50) DEFAULT NULL COMMENT 'Sequential contract number (PREFIX-YYYY-0001)' AFTER status",
      );
    } else {
      console.log('✅ Column contracts.contract_number already exists');
    }

    const [indexes] = await conn.query(
      `SELECT 1
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contracts' AND INDEX_NAME = 'uq_contracts_contract_number'`,
      [dbName],
    );

    if (indexes.length === 0) {
      console.log('📝 Adding unique index uq_contracts_contract_number...');
      await conn.query(
        'ALTER TABLE contracts ADD UNIQUE KEY uq_contracts_contract_number (contract_number)',
      );
    } else {
      console.log('✅ Unique index uq_contracts_contract_number already exists');
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
