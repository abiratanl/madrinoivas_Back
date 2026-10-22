const db = require('../config/database');

/**
 * Migration: fitting date on rentals.
 * Adds the optional fitting_date column (dress fitting appointment, always
 * before or on the pickup date stored in start_date).
 * Idempotent: guarded by an information_schema check.
 */
async function migrate() {
  console.log('🔧 Running migration: rentals.fitting_date column...');

  const conn = await db.getConnection();
  try {
    const [dbRow] = await conn.query('SELECT DATABASE() AS db_name');
    const dbName = dbRow[0].db_name;

    const [rows] = await conn.query(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [dbName, 'rentals', 'fitting_date'],
    );

    if (rows.length === 0) {
      console.log('📝 Adding fitting_date column to rentals...');
      await conn.query(
        'ALTER TABLE rentals ADD COLUMN fitting_date DATETIME NULL AFTER start_date',
      );
      console.log('✅ fitting_date column added!');
    } else {
      console.log('✅ fitting_date column already exists');
    }

    console.log('🎉 Migration finished.');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));
