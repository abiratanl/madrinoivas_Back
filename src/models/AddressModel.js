const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class AddressModel {
  static async findByStoreId(storeId) {
    const [rows] = await db.query(
      'SELECT * FROM addresses WHERE store_id = ? ORDER BY is_default DESC',
      [storeId]
    );
    return rows;
  }

  static async findByCustomerId(customerId) {
    const [rows] = await db.query(
      'SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC',
      [customerId]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM addresses WHERE id = ?', [id]);
    return rows[0];
  }

  static async create(addressData, conn = null) {
    const id = uuidv4();
    const {
      customer_id = null,
      store_id = null,
      type = 'commercial',
      label = 'Principal',
      zip_code,
      street,
      number,
      complement = null,
      neighborhood = null,
      city,
      state,
      is_default = 1
    } = addressData;

    const query = `
      INSERT INTO addresses (id, customer_id, store_id, type, label, zip_code, street, number, complement, neighborhood, city, state, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id, customer_id, store_id, type, label, zip_code, street, number, complement, neighborhood, city, state, is_default ? 1 : 0
    ];

    if (conn) {
      await conn.query(query, params);
    } else {
      await db.query(query, params);
    }

    return { id, ...addressData };
  }

  static async update(id, data, conn = null) {
    const fields = [];
    const values = [];

    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.label !== undefined) { fields.push('label = ?'); values.push(data.label); }
    if (data.zip_code !== undefined) { fields.push('zip_code = ?'); values.push(data.zip_code); }
    if (data.street !== undefined) { fields.push('street = ?'); values.push(data.street); }
    if (data.number !== undefined) { fields.push('number = ?'); values.push(data.number); }
    if (data.complement !== undefined) { fields.push('complement = ?'); values.push(data.complement); }
    if (data.neighborhood !== undefined) { fields.push('neighborhood = ?'); values.push(data.neighborhood); }
    if (data.city !== undefined) { fields.push('city = ?'); values.push(data.city); }
    if (data.state !== undefined) { fields.push('state = ?'); values.push(data.state); }
    if (data.is_default !== undefined) { fields.push('is_default = ?'); values.push(data.is_default ? 1 : 0); }

    if (fields.length === 0) return false;

    values.push(id);
    const query = `UPDATE addresses SET ${fields.join(', ')} WHERE id = ?`;

    if (conn) {
      await conn.query(query, values);
    } else {
      await db.query(query, values);
    }

    return true;
  }

  static async deleteByStoreId(storeId, conn = null) {
    if (conn) {
      await conn.query('DELETE FROM addresses WHERE store_id = ?', [storeId]);
    } else {
      await db.query('DELETE FROM addresses WHERE store_id = ?', [storeId]);
    }
    return true;
  }

  static async deleteByCustomerId(customerId, conn = null) {
    if (conn) {
      await conn.query('DELETE FROM addresses WHERE customer_id = ?', [customerId]);
    } else {
      await db.query('DELETE FROM addresses WHERE customer_id = ?', [customerId]);
    }
    return true;
  }

  static async formatAddress(addr) {
    if (!addr) return null;
    return `${addr.street || ''}, ${addr.number || ''}${addr.complement ? ' ' + addr.complement : ''}${addr.neighborhood ? ' - ' + addr.neighborhood : ''}, ${addr.city || ''} - ${addr.state || ''}${addr.zip_code ? ' ' + addr.zip_code : ''}`.replace(/^, |, $/g, '');
  }
}

module.exports = AddressModel;