const db = require('../config/database');

/**
 * Migration: store legal/representative fields.
 * Adds cnpj, owner_name, owner_cpf and owner_signature (R2 object path) to
 * the stores table. Used on the rental contract PDF.
 * Idempotent: each column is guarded by an information_schema check.
 */
async function migrate() {
  console.log('🔧 Running migration: store owner fields...');

  const columns = [
    { name: 'cnpj', ddl: "ADD COLUMN cnpj varchar(18) DEFAULT NULL AFTER phone" },
    {
      name: 'owner_name',
      ddl: "ADD COLUMN owner_name varchar(255) DEFAULT NULL COMMENT 'Legal representative name' AFTER cnpj",
    },
    {
      name: 'owner_cpf',
      ddl: "ADD COLUMN owner_cpf varchar(14) DEFAULT NULL COMMENT 'Legal representative CPF' AFTER owner_name",
    },
    {
      name: 'owner_signature',
      ddl: "ADD COLUMN owner_signature mediumtext COMMENT 'Owner signature image path in R2 storage' AFTER owner_cpf",
    },
  ];

  const conn = await db.getConnection();
  try {
    const [dbRow] = await conn.query('SELECT DATABASE() AS db_name');
    const dbName = dbRow[0].db_name;

    for (const column of columns) {
      const [rows] = await conn.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [dbName, 'stores', column.name],
      );

      if (rows.length === 0) {
        console.log(`📝 Adding column stores.${column.name}...`);
        await conn.query(`ALTER TABLE stores ${column.ddl}`);
        console.log(`✅ stores.${column.name} added!`);
      } else {
        console.log(`✅ stores.${column.name} already exists`);
      }
    }

    console.log('🎉 Migration finished.');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));
