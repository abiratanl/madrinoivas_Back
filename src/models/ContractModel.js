const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const DELIVERY_STATUS_COLUMNS = {
  whatsapp: 'whatsapp_delivery_status',
  email: 'email_delivery_status',
};

class ContractModel {
  /**
   * Registers a generated rental contract.
   */
  static async create({ rentalId, customerId, lesseeSignature, issuedAt, createdBy }) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO contracts (id, rental_id, customer_id, lessee_signature, issued_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, rentalId, customerId, lesseeSignature, issuedAt, createdBy || null],
    );
    return { id, rentalId, customerId, lesseeSignature, issuedAt, createdBy };
  }

  /**
   * Finds a contract by id.
   */
  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM contracts WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Lists all contracts issued for a rental, most recent first.
   */
  static async findByRentalId(rentalId) {
    const [rows] = await db.query(
      'SELECT * FROM contracts WHERE rental_id = ? ORDER BY issued_at DESC',
      [rentalId],
    );
    return rows;
  }

  /**
   * Updates the delivery status of a contract for a given channel
   * ('whatsapp' | 'email') to 'pending' | 'sent' | 'failed'.
   */
  static async updateDeliveryStatus(id, channel, status) {
    const column = DELIVERY_STATUS_COLUMNS[channel];
    if (!column) {
      throw new Error(`Unknown delivery channel: ${channel}`);
    }
    await db.query(`UPDATE contracts SET ${column} = ? WHERE id = ?`, [status, id]);
  }
}

module.exports = ContractModel;
