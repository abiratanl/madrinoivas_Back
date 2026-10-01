const db = require('../config/database'); 
const { v4: uuidv4 } = require('uuid');
const AddressModel = require('./AddressModel');

class Store {
  static async findAll(showInactive = false) {
    let query = `
      SELECT s.id, s.name, s.phone, s.is_active, s.created_at, s.updated_at,
             a.id as address_id, a.street, a.number, a.complement, a.neighborhood, a.city, a.state, a.zip_code,
             a.type, a.label, a.is_default
      FROM stores s
      LEFT JOIN addresses a ON a.store_id = s.id AND a.is_default = 1
    `;
    if (!showInactive) {
      query += ` WHERE s.is_active = 1`;
    }
    query += ` ORDER BY s.name ASC`;
    const [rows] = await db.execute(query);
    
    return rows.map(row => ({
      ...row,
      address: row.address_id ? `${row.street || ''}, ${row.number || ''}${row.complement ? ' ' + row.complement : ''}${row.neighborhood ? ' - ' + row.neighborhood : ''}, ${row.city || ''} - ${row.state || ''}${row.zip_code ? ' ' + row.zip_code : ''}`.replace(/^, |, $/g, '') : null,
      addresses: row.address_id ? [{...row}] : []
    }));
  }

  static async findById(id) {
    // Get store
    const [storeRows] = await db.execute(
      'SELECT id, name, phone, is_active, created_at, updated_at FROM stores WHERE id = ?',
      [id]
    );
    if (!storeRows[0]) return null;
    const store = storeRows[0];

    // Get all addresses for this store
    const [addressRows] = await db.execute(
      'SELECT * FROM addresses WHERE store_id = ? ORDER BY is_default DESC',
      [id]
    );

    const primaryAddress = addressRows[0];
    
    return {
      ...store,
      address: primaryAddress ? `${primaryAddress.street || ''}, ${primaryAddress.number || ''}${primaryAddress.complement ? ' ' + primaryAddress.complement : ''}${primaryAddress.neighborhood ? ' - ' + primaryAddress.neighborhood : ''}, ${primaryAddress.city || ''} - ${primaryAddress.state || ''}${primaryAddress.zip_code ? ' ' + primaryAddress.zip_code : ''}`.replace(/^, |, $/g, '') : null,
      addresses: addressRows
    };
  }

  static async create(storeData) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      
      const { name, phone, addresses } = storeData;
      const id = uuidv4();

      // Create store
      const query = `
        INSERT INTO stores (id, name, phone, is_active) 
        VALUES (?, ?, ?, 1)
      `;
      await conn.query(query, [id, name, phone || null]);

      // Create addresses if provided
      if (addresses && addresses.length > 0) {
        for (const addr of addresses) {
          await AddressModel.create({ ...addr, store_id: id }, conn);
        }
      }

      await conn.commit();
      return { id, name, phone, is_active: 1, created_at: new Date(), updated_at: new Date(), addresses: addresses || [] };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async update(id, data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const fields = [];
      const values = [];

      if (data.name !== undefined) {
        fields.push('name = ?');
        values.push(data.name);
      }
      if (data.phone !== undefined) {
        fields.push('phone = ?');
        values.push(data.phone);
      }
      if (data.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(data.is_active);
      }

      if (fields.length > 0) {
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        const query = `UPDATE stores SET ${fields.join(', ')} WHERE id = ?`;
        await conn.query(query, values);
      }

      // Handle addresses if provided
      if (data.addresses) {
        // Delete existing addresses for this store
        await AddressModel.deleteByStoreId(id, conn);
        
        // Create new addresses
        for (const addr of data.addresses) {
          await AddressModel.create({ ...addr, store_id: id }, conn);
        }
      }

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async toggleActive(id) {
    const query = `UPDATE stores SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Store;