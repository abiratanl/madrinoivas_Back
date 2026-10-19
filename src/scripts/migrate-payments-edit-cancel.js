const db = require('../config/database');

/**
 * Migration: payments edit/cancel feature.
 * - Creates the installments table (if missing).
 * - Adds the new payments columns (installment_id, user_id, type, payment_method,
 *   status, paid_at, cancelled_at, cancelled_by, cancellation_reason).
 * - Renames the legacy `method` column to `payment_method` when present.
 * Idempotent: every step is guarded by an information_schema check.
 */
async function migrate() {
  console.log(
    '🔧 Running migration: payments edit/cancel (installments table + payments columns)...',
  );

  const conn = await db.getConnection();
  try {
    const [dbRow] = await conn.query('SELECT DATABASE() AS db_name');
    const dbName = dbRow[0].db_name;

    const tableExists = async (table) => {
      const [rows] = await conn.query(
        'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [dbName, table],
      );
      return rows.length > 0;
    };

    const columnExists = async (table, column) => {
      const [rows] = await conn.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [dbName, table, column],
      );
      return rows.length > 0;
    };

    // 1. Installments table
    if (!(await tableExists('installments'))) {
      console.log('📝 Creating installments table...');
      await conn.query(`
        CREATE TABLE installments (
          id char(36) NOT NULL,
          rental_id char(36) NOT NULL,
          number int NOT NULL,
          total_installments int NOT NULL,
          value decimal(10,2) NOT NULL,
          due_date date NOT NULL,
          amount_paid decimal(10,2) NOT NULL DEFAULT '0.00',
          status enum('pending','partially_paid','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
          type enum('installment','penalty') NOT NULL DEFAULT 'installment',
          paid_at timestamp NULL DEFAULT NULL,
          created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_installments_rental_number_type (rental_id, number, type),
          CONSTRAINT fk_installments_rental FOREIGN KEY (rental_id) REFERENCES rentals (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ installments table created!');
    } else {
      console.log('✅ installments table already exists');
    }

    // 2. Legacy `method` column -> `payment_method`
    if (await columnExists('payments', 'method')) {
      console.log('📝 Renaming legacy payments.method column to payment_method...');
      await conn.query(`
        ALTER TABLE payments
        CHANGE COLUMN method payment_method enum('cash','credit_card','debit_card','pix','bank_transfer') NOT NULL
      `);
      console.log('✅ method column migrated to payment_method!');
    } else if (!(await columnExists('payments', 'payment_method'))) {
      console.log('📝 Adding payment_method column to payments...');
      await conn.query(`
        ALTER TABLE payments
        ADD COLUMN payment_method enum('cash','credit_card','debit_card','pix','bank_transfer') NOT NULL AFTER amount
      `);
      console.log('✅ payment_method column added!');
    } else {
      console.log('✅ payment_method column already exists');
    }

    // 3. Add remaining missing columns
    const newColumns = [
      {
        name: 'installment_id',
        ddl: `ADD COLUMN installment_id char(36) DEFAULT NULL AFTER rental_id,
              ADD KEY fk_payments_installment (installment_id),
              ADD CONSTRAINT fk_payments_installment FOREIGN KEY (installment_id) REFERENCES installments (id) ON DELETE SET NULL`,
      },
      {
        name: 'user_id',
        ddl: `ADD COLUMN user_id char(36) DEFAULT NULL AFTER installment_id,
              ADD KEY fk_payments_user (user_id),
              ADD CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL`,
      },
      {
        name: 'type',
        ddl: `ADD COLUMN type enum('entry','installment','spontaneous','pickup_balance') NOT NULL DEFAULT 'spontaneous' AFTER amount`,
      },
      {
        name: 'status',
        ddl: `ADD COLUMN status enum('confirmed','cancelled') NOT NULL DEFAULT 'confirmed' AFTER notes`,
      },
      {
        name: 'cancelled_at',
        ddl: `ADD COLUMN cancelled_at timestamp NULL DEFAULT NULL AFTER paid_at`,
      },
      {
        name: 'cancelled_by',
        ddl: `ADD COLUMN cancelled_by char(36) DEFAULT NULL AFTER cancelled_at,
              ADD KEY fk_payments_cancelled_by (cancelled_by),
              ADD CONSTRAINT fk_payments_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL`,
      },
      {
        name: 'cancellation_reason',
        ddl: `ADD COLUMN cancellation_reason text DEFAULT NULL AFTER cancelled_by`,
      },
    ];

    for (const column of newColumns) {
      if (!(await columnExists('payments', column.name))) {
        console.log(`📝 Adding ${column.name} column to payments...`);
        await conn.query(`ALTER TABLE payments ${column.ddl}`);
        console.log(`✅ ${column.name} column added!`);
      } else {
        console.log(`✅ ${column.name} column already exists`);
      }
    }

    // 4. paid_at: legacy schema used nullable datetime without default
    console.log('📝 Ensuring payments.paid_at defaults to CURRENT_TIMESTAMP...');
    await conn.query(`
      ALTER TABLE payments
      MODIFY COLUMN paid_at timestamp NULL DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('✅ paid_at column normalized!');

    console.log('🎉 Migration finished.');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    conn.release();
  }
}

migrate().then(() => process.exit(0));
