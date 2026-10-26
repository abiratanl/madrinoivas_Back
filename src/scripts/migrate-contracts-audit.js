const db = require('../config/database');

/**
 * Migration: contract audit trail and dual PDF persistence.
 *
 * Adds the columns required to keep both the original draft PDF and the final
 * signed PDF in Cloudflare R2, plus the signature audit metadata (IP, device,
 * timestamp, SHA-256 hash).
 *
 * Idempotent: every column is checked against information_schema before being
 * added, so this script can be re-run safely. Existing contracts are marked as
 * signed and keep issued_at as their signature timestamp until reissued.
 */
async function hasColumn(conn, dbName, table, column) {
  const [rows] = await conn.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column],
  );
  return rows.length > 0;
}

async function addColumnIfMissing(conn, dbName, table, column, definition) {
  if (await hasColumn(conn, dbName, table, column)) {
    console.log(`✅ Column contracts.${column} already exists`);
    return;
  }
  console.log(`📝 Adding column contracts.${column}...`);
  await conn.query(`ALTER TABLE contracts ADD COLUMN ${column} ${definition}`);
}

async function migrate() {
  console.log('🔧 Running migration: contract audit trail...');

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

    await addColumnIfMissing(
      conn,
      dbName,
      'contracts',
      'status',
      "enum('draft','pending_signature','signed','cancelled') NOT NULL DEFAULT 'draft' AFTER customer_id",
    );
    await addColumnIfMissing(
      conn,
      dbName,
      'contracts',
      'document_hash',
      "varchar(64) DEFAULT NULL COMMENT 'SHA-256 hash of the original draft PDF' AFTER lessee_signature",
    );
    await addColumnIfMissing(
      conn,
      dbName,
      'contracts',
      'signed_at',
      "datetime DEFAULT NULL COMMENT 'Exact signature date/time (milliseconds)' AFTER document_hash",
    );
    await addColumnIfMissing(
      conn,
      dbName,
      'contracts',
      'signer_ip',
      "varchar(45) DEFAULT NULL COMMENT 'IP address of the signing tablet' AFTER signed_at",
    );
    await addColumnIfMissing(
      conn,
      dbName,
      'contracts',
      'device_user_agent',
      "text DEFAULT NULL COMMENT 'Tablet hardware/browser information' AFTER signer_ip",
    );
    await addColumnIfMissing(
      conn,
      dbName,
      'contracts',
      'draft_pdf_path',
      "varchar(255) DEFAULT NULL COMMENT 'R2 key of the original draft PDF' AFTER device_user_agent",
    );
    await addColumnIfMissing(
      conn,
      dbName,
      'contracts',
      'signed_pdf_path',
      "varchar(255) DEFAULT NULL COMMENT 'R2 key of the final signed PDF' AFTER draft_pdf_path",
    );

    // Legacy contracts already have a signature and must be treated as signed.
    await conn.query(
      `UPDATE contracts
          SET status = 'signed',
              signed_at = COALESCE(signed_at, issued_at)
        WHERE status IN ('draft', 'pending_signature')
          AND lessee_signature IS NOT NULL
          AND lessee_signature <> ''`,
    );

    // document_hash is required for new contracts. Legacy rows predate the
    // audit trail and have no draft file to hash; use a zero hash placeholder.
    await conn.query(
      "UPDATE contracts SET document_hash = REPEAT('0', 64) WHERE document_hash IS NULL OR document_hash = ''",
    );

    const [hashColumn] = await conn.query(
      `SELECT IS_NULLABLE, COLUMN_TYPE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'document_hash'`,
      [dbName],
    );
    if (hashColumn[0] && hashColumn[0].IS_NULLABLE === 'YES') {
      console.log('📝 Making contracts.document_hash NOT NULL...');
      await conn.query(
        "ALTER TABLE contracts MODIFY COLUMN document_hash varchar(64) NOT NULL COMMENT 'SHA-256 hash of the original draft PDF'",
      );
    }

    const [signatureColumn] = await conn.query(
      `SELECT IS_NULLABLE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'lessee_signature'`,
      [dbName],
    );
    if (signatureColumn[0] && signatureColumn[0].IS_NULLABLE === 'NO') {
      console.log('📝 Allowing contracts.lessee_signature to be NULL for drafts...');
      await conn.query(
        "ALTER TABLE contracts MODIFY COLUMN lessee_signature mediumtext NULL COMMENT 'Lessee signature as a PNG data URL'",
      );
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
