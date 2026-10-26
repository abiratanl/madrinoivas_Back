const db = require('../config/database');

/**
 * Migration: rental contracts feature.
 * Creates the contracts table (one record per generated/signed contract) with
 * the audit columns used to persist both draft and signed PDFs in R2.
 * Idempotent: guarded by an information_schema check.
 */
async function migrate() {
  console.log('🔧 Running migration: contracts table...');

  const conn = await db.getConnection();
  try {
    const [dbRow] = await conn.query('SELECT DATABASE() AS db_name');
    const dbName = dbRow[0].db_name;

    const [rows] = await conn.query(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbName, 'contracts'],
    );

    if (rows.length === 0) {
      console.log('📝 Creating contracts table...');
      await conn.query(`
        CREATE TABLE contracts (
          id char(36) NOT NULL,
          rental_id char(36) NOT NULL,
          customer_id char(36) NOT NULL,
          status enum('draft','pending_signature','signed','cancelled') NOT NULL DEFAULT 'draft',
          contract_number varchar(50) DEFAULT NULL,
          lessee_signature mediumtext NULL,
          document_hash varchar(64) NOT NULL,
          signed_at datetime DEFAULT NULL,
          signer_ip varchar(45) DEFAULT NULL,
          device_user_agent text DEFAULT NULL,
          draft_pdf_path varchar(255) DEFAULT NULL,
          signed_pdf_path varchar(255) DEFAULT NULL,
          notes text DEFAULT NULL,
          issued_at datetime NOT NULL,
          created_by char(36) DEFAULT NULL,
          whatsapp_delivery_status enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
          email_delivery_status enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
          created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_contracts_contract_number (contract_number),
          KEY fk_contracts_rental (rental_id),
          KEY fk_contracts_customer (customer_id),
          KEY fk_contracts_created_by (created_by),
          CONSTRAINT fk_contracts_rental FOREIGN KEY (rental_id) REFERENCES rentals (id) ON DELETE CASCADE,
          CONSTRAINT fk_contracts_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
          CONSTRAINT fk_contracts_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ contracts table created!');
    } else {
      console.log('✅ contracts table already exists');
    }

    console.log('🎉 Migration finished.');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));
