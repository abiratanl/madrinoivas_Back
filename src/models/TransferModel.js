const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class TransferModel {
  static async create(data) {
    const id = uuidv4();
    const { product_id, from_store_id, to_store_id, requested_by, notes } = data;

    const sql = `
      INSERT INTO product_transfers (
        id, product_id, from_store_id, to_store_id, requested_by, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'in_transit')
    `;

    await db.query(sql, [id, product_id, from_store_id, to_store_id, requested_by, notes || null]);
    return { id, ...data, status: 'in_transit' };
  }

  static async findById(id) {
    const sql = `
      SELECT t.*, 
             p.name as product_name, 
             p.code as product_code,
             s_from.name as from_store_name,
             s_to.name as to_store_name,
             u_req.name as requested_by_name,
             u_rec.name as received_by_name
      FROM product_transfers t
      JOIN products p ON t.product_id = p.id
      JOIN stores s_from ON t.from_store_id = s_from.id
      JOIN stores s_to ON t.to_store_id = s_to.id
      LEFT JOIN users u_req ON t.requested_by = u_req.id
      LEFT JOIN users u_rec ON t.received_by = u_rec.id
      WHERE t.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    return rows[0];
  }

  /**
   * Lista transferências. Útil para mostrar "A chegar" na loja de destino.
   */
  static async findAll(filters = {}) {
    let sql = `
      SELECT t.*, 
             p.name as product_name, 
             p.code as product_code,
             s_from.name as from_store_name, 
             s_to.name as to_store_name,
             u_req.name as requested_by_name,
             u_rec.name as received_by_name
      FROM product_transfers t
      JOIN products p ON t.product_id = p.id
      JOIN stores s_from ON t.from_store_id = s_from.id
      JOIN stores s_to ON t.to_store_id = s_to.id
      LEFT JOIN users u_req ON t.requested_by = u_req.id
      LEFT JOIN users u_rec ON t.received_by = u_rec.id
      WHERE 1=1
    `;

    const params = [];

    // Filtro: Ver o que está a chegar à minha loja
    if (filters.to_store_id) {
      sql += ' AND t.to_store_id = ?';
      params.push(filters.to_store_id);
    }
    
    // Filtro: Ver o que enviei
    if (filters.from_store_id) {
      sql += ' AND t.from_store_id = ?';
      params.push(filters.from_store_id);
    }

    if (filters.status) {
      sql += ' AND t.status = ?';
      params.push(filters.status);
    }

    // Filtro: Transferências de um produto específico
    if (filters.product_id) {
      sql += ' AND t.product_id = ?';
      params.push(filters.product_id);
    }

    sql += ' ORDER BY t.requested_at DESC';

    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async updateStatus(id, status, receivedAt = null, receivedBy = null) {
    let sql = 'UPDATE product_transfers SET status = ?';
    const params = [status];

    if (receivedAt) {
      sql += ', received_at = ?';
      params.push(receivedAt);
    }

    if (receivedBy) {
      sql += ', received_by = ?';
      params.push(receivedBy);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    const [result] = await db.query(sql, params);
    return result.affectedRows > 0;
  }
}

module.exports = TransferModel;