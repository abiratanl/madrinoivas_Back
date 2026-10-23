const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const AddressModel = require('./AddressModel');

const STORE_COLUMNS =
  'id, name, cnpj, owner_name, owner_cpf, owner_signature, is_active, created_at, updated_at';

class Store {
  static async findAll(showInactive = false) {
    let query = `
      SELECT s.id, s.name, s.cnpj, s.owner_name, s.owner_cpf, s.owner_signature,
             s.is_active, s.created_at, s.updated_at,
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

    const contactsByStore = await Store._findContactsByStoreIds(rows.map((row) => row.id));

    return rows.map((row) => ({
      ...row,
      address: row.address_id ? AddressModel.formatAddress(row) : null,
      addresses: row.address_id ? [{ ...row }] : [],
      contacts: contactsByStore[row.id] || [],
    }));
  }

  static async findById(id) {
    // Get store
    const [storeRows] = await db.execute(`SELECT ${STORE_COLUMNS} FROM stores WHERE id = ?`, [id]);
    if (!storeRows[0]) return null;
    const store = storeRows[0];

    // Get all addresses for this store
    const [addressRows] = await db.execute(
      'SELECT * FROM addresses WHERE store_id = ? ORDER BY is_default DESC',
      [id],
    );

    // Get all contacts for this store
    const [contactRows] = await db.execute(
      'SELECT * FROM contacts WHERE store_id = ? ORDER BY is_primary DESC, created_at ASC',
      [id],
    );

    const primaryAddress = addressRows[0];

    return {
      ...store,
      address: primaryAddress ? AddressModel.formatAddress(primaryAddress) : null,
      addresses: addressRows,
      contacts: contactRows,
    };
  }

  static async create(storeData) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const { name, cnpj, owner_name, owner_cpf, owner_signature, addresses, contacts } = storeData;
      const id = uuidv4();

      // Create store
      const query = `
        INSERT INTO stores (id, name, cnpj, owner_name, owner_cpf, owner_signature, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `;
      await conn.query(query, [
        id,
        name,
        cnpj || null,
        owner_name || null,
        owner_cpf || null,
        owner_signature || null,
      ]);

      // Create addresses if provided
      if (addresses && addresses.length > 0) {
        for (const addr of addresses) {
          await AddressModel.create({ ...addr, store_id: id }, conn);
        }
      }

      // Create contacts if provided
      if (contacts && contacts.length > 0) {
        for (const ct of contacts) {
          await conn.query(
            `INSERT INTO contacts (id, store_id, type, value, is_primary) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), id, ct.type, ct.value, ct.is_primary ? 1 : 0],
          );
        }
      }

      await conn.commit();
      return Store.findById(id);
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

      const [existing] = await conn.query('SELECT id FROM stores WHERE id = ?', [id]);
      if (!existing[0]) {
        await conn.rollback();
        return false;
      }

      const updatableFields = [
        'name',
        'cnpj',
        'owner_name',
        'owner_cpf',
        'owner_signature',
        'is_active',
      ];
      const fields = [];
      const values = [];

      for (const field of updatableFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(data[field]);
        }
      }

      if (fields.length > 0) {
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        const query = `UPDATE stores SET ${fields.join(', ')} WHERE id = ?`;
        await conn.query(query, values);
      }

      // Sync addresses only when the array is provided (delete-all + re-insert)
      if (Array.isArray(data.addresses)) {
        await AddressModel.deleteByStoreId(id, conn);

        for (const addr of data.addresses) {
          await AddressModel.create({ ...addr, store_id: id }, conn);
        }
      }

      // Sync contacts only when the array is provided (delete-all + re-insert)
      if (Array.isArray(data.contacts)) {
        await conn.query('DELETE FROM contacts WHERE store_id = ?', [id]);
        for (const ct of data.contacts) {
          await conn.query(
            `INSERT INTO contacts (id, store_id, type, value, is_primary) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), id, ct.type, ct.value, ct.is_primary ? 1 : 0],
          );
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

  // Fetch active stores available as transfer destinations (all but the given one)
  static async findAllForTransfer(excludeStoreId) {
    const query = `
      SELECT s.id, s.name, s.cnpj, s.is_active, s.created_at, s.updated_at,
             a.id as address_id, a.street, a.number, a.complement, a.neighborhood, a.city, a.state, a.zip_code,
             a.type, a.label, a.is_default
      FROM stores s
      LEFT JOIN addresses a ON a.store_id = s.id AND a.is_default = 1
      WHERE s.is_active = 1 AND s.id != ?
      ORDER BY s.name ASC
    `;
    const [rows] = await db.execute(query, [excludeStoreId]);

    return rows.map((row) => ({
      ...row,
      address: row.address_id ? AddressModel.formatAddress(row) : null,
      addresses: row.address_id ? [{ ...row }] : [],
    }));
  }

  // Group contacts by store id for the given set of stores
  static async _findContactsByStoreIds(storeIds) {
    if (!storeIds || storeIds.length === 0) return {};

    const placeholders = storeIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
      `SELECT * FROM contacts WHERE store_id IN (${placeholders}) ORDER BY is_primary DESC, created_at ASC`,
      storeIds,
    );

    return rows.reduce((acc, contact) => {
      if (!acc[contact.store_id]) acc[contact.store_id] = [];
      acc[contact.store_id].push(contact);
      return acc;
    }, {});
  }
}

module.exports = Store;
