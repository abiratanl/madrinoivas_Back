const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class PaymentModel {
  /**
   * Registers a payment and updates the linked installment (if any)
   */
  static async create(data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const paymentId = uuidv4();
      const { rental_id, installment_id, user_id, amount, payment_method, type, notes } = data;

      // 1. Insert the Payment (receipt)
      await conn.query(
        `INSERT INTO payments (id, rental_id, installment_id, user_id, amount, type, payment_method, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          rental_id,
          installment_id || null,
          user_id,
          amount,
          type || 'spontaneous',
          payment_method,
          notes || null,
        ],
      );

      // 2. Update the linked Installment (if any)
      if (installment_id) {
        // Fetch current installment info with a row lock to avoid race conditions
        const [rows] = await conn.query('SELECT * FROM installments WHERE id = ? FOR UPDATE', [
          installment_id,
        ]);
        const installment = rows[0];

        if (installment) {
          const newPaidAmount = parseFloat(installment.amount_paid) + parseFloat(amount);
          const totalValue = parseFloat(installment.value);

          // Status: 'paid' when fully covered (small float margin), otherwise 'partially_paid'
          const isFullyPaid = newPaidAmount >= totalValue - 0.01;
          const newStatus = isFullyPaid ? 'paid' : 'partially_paid';

          // paid_at is only stamped when the installment becomes fully paid
          await conn.query(
            `UPDATE installments 
             SET amount_paid = ?, status = ?, paid_at = ? 
             WHERE id = ?`,
            [newPaidAmount, newStatus, isFullyPaid ? new Date() : null, installment_id],
          );
        }
      }

      await conn.commit();
      conn.release();
      return { id: paymentId, ...data };
    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }

  /**
   * Sum of confirmed payments already registered for a rental
   */
  static async getTotalPaidByRentalId(rentalId) {
    const [rows] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM payments
       WHERE rental_id = ? AND status != 'cancelled'`,
      [rentalId],
    );
    return parseFloat(rows[0].total_paid);
  }

  /**
   * Find a single installment by id (used to validate payment linkage)
   */
  static async findInstallmentById(id) {
    const [rows] = await db.query('SELECT * FROM installments WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Lista pagamentos de um aluguel específico
   */
  static async findByRentalId(rentalId) {
    const sql = `
      SELECT p.*, u.name as user_name, cu.name as cancelled_by_name
      FROM payments p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN users cu ON p.cancelled_by = cu.id
      WHERE p.rental_id = ?
      ORDER BY p.paid_at DESC
    `;
    const [rows] = await db.query(sql, [rentalId]);
    return rows;
  }

  /**
   * Find a single payment by id (with the name of the user who registered it)
   */
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT p.*, u.name as user_name
       FROM payments p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
      [id],
    );
    return rows[0] || null;
  }

  /**
   * Recomputes an installment status after its amount_paid changes.
   * paid_at is stamped only on the transition to 'paid'.
   */
  static async _syncInstallmentStatus(conn, installment, newAmountPaid) {
    const totalValue = parseFloat(installment.value);

    let newStatus;
    let paidAt = null;
    if (newAmountPaid <= 0) {
      newStatus = 'pending';
    } else if (newAmountPaid >= totalValue - 0.01) {
      newStatus = 'paid';
      // Keep the original paid_at when already paid; stamp only on transition
      paidAt = installment.status === 'paid' ? installment.paid_at : new Date();
    } else {
      newStatus = 'partially_paid';
    }

    await conn.query(
      'UPDATE installments SET amount_paid = ?, status = ?, paid_at = ? WHERE id = ?',
      [Math.max(newAmountPaid, 0), newStatus, paidAt, installment.id],
    );
  }

  /**
   * Updates a payment, reverting its effect on the previously linked
   * installment and applying the new amount/link.
   */
  static async update(id, data, oldPayment) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const newAmount = data.amount !== undefined ? data.amount : parseFloat(oldPayment.amount);
      const newInstallmentId =
        data.installment_id !== undefined ? data.installment_id : oldPayment.installment_id;

      // 1. Revert the effect on the old installment (row lock)
      if (oldPayment.installment_id) {
        const [rows] = await conn.query('SELECT * FROM installments WHERE id = ? FOR UPDATE', [
          oldPayment.installment_id,
        ]);
        if (rows[0]) {
          const reverted = parseFloat(rows[0].amount_paid) - parseFloat(oldPayment.amount);
          await this._syncInstallmentStatus(conn, rows[0], reverted);
        }
      }

      // 2. Apply the effect on the new installment (row lock)
      if (newInstallmentId) {
        const [rows] = await conn.query('SELECT * FROM installments WHERE id = ? FOR UPDATE', [
          newInstallmentId,
        ]);
        if (rows[0]) {
          const applied = parseFloat(rows[0].amount_paid) + newAmount;
          await this._syncInstallmentStatus(conn, rows[0], applied);
        }
      }

      // 3. Update only the provided payment fields
      const fields = [];
      const params = [];
      if (data.amount !== undefined) {
        fields.push('amount = ?');
        params.push(data.amount);
      }
      if (data.type !== undefined) {
        fields.push('type = ?');
        params.push(data.type);
      }
      if (data.payment_method !== undefined) {
        fields.push('payment_method = ?');
        params.push(data.payment_method);
      }
      if (data.installment_id !== undefined) {
        fields.push('installment_id = ?');
        params.push(data.installment_id);
      }
      if (data.notes !== undefined) {
        fields.push('notes = ?');
        params.push(data.notes);
      }
      if (fields.length > 0) {
        params.push(id);
        await conn.query(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`, params);
      }

      await conn.commit();
      conn.release();
      return { ...oldPayment, ...data };
    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }

  /**
   * Soft-cancels a payment and reverts its effect on the linked installment.
   * Throws an Error('PAYMENT_ALREADY_CANCELLED') when already cancelled.
   */
  static async cancel(id, cancelledBy, reason) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Lock the payment row to avoid concurrent cancels
      const [rows] = await conn.query('SELECT * FROM payments WHERE id = ? FOR UPDATE', [id]);
      const payment = rows[0];
      if (!payment) {
        await conn.rollback();
        conn.release();
        return null;
      }
      if (payment.status === 'cancelled') {
        throw new Error('PAYMENT_ALREADY_CANCELLED');
      }

      // 2. Revert the effect on the linked installment (row lock)
      if (payment.installment_id) {
        const [instRows] = await conn.query('SELECT * FROM installments WHERE id = ? FOR UPDATE', [
          payment.installment_id,
        ]);
        if (instRows[0]) {
          const reverted = parseFloat(instRows[0].amount_paid) - parseFloat(payment.amount);
          await this._syncInstallmentStatus(conn, instRows[0], reverted);
        }
      }

      // 3. Mark the payment as cancelled
      await conn.query(
        `UPDATE payments
         SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, cancellation_reason = ?
         WHERE id = ?`,
        [cancelledBy, reason, id],
      );

      await conn.commit();
      conn.release();
      return true;
    } catch (error) {
      await conn.rollback();
      conn.release();
      throw error;
    }
  }
}

module.exports = PaymentModel;
