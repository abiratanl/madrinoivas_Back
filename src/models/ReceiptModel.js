const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ReceiptModel {
  /**
   * Registers an issued receipt for a payment.
   */
  static async create({ paymentId, customerId, amount, paymentMethod, issuedAt, createdBy }) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO receipts (id, payment_id, customer_id, amount, payment_method, issued_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, paymentId, customerId, amount, paymentMethod, issuedAt, createdBy || null],
    );
    return { id, paymentId, customerId, amount, paymentMethod, issuedAt, createdBy };
  }

  /**
   * Updates the WhatsApp delivery status of a receipt
   * ('pending' | 'sent' | 'failed').
   */
  static async updateDeliveryStatus(id, status) {
    await db.query('UPDATE receipts SET whatsapp_delivery_status = ? WHERE id = ?', [status, id]);
  }

  /**
   * Lists all receipts issued for a payment.
   */
  static async findByPaymentId(paymentId) {
    const [rows] = await db.query(
      'SELECT * FROM receipts WHERE payment_id = ? ORDER BY issued_at DESC',
      [paymentId],
    );
    return rows;
  }
}

module.exports = ReceiptModel;
