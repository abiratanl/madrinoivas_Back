const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class CustomerModel {
  static async findAll(filters = {}) {
    let sql = `
      SELECT 
        c.id, c.store_id, c.name, c.rg, c.cpf, c.birth_date, c.is_active,
        (SELECT value FROM contacts WHERE customer_id = c.id AND type IN ('whatsapp','mobile') ORDER BY is_primary DESC LIMIT 1) as main_phone,
        (SELECT city FROM addresses WHERE customer_id = c.id ORDER BY is_default DESC LIMIT 1) as city
      FROM customers c
      WHERE c.deleted_at IS NULL
    `;
    const params = [];
    if (filters.search) {
      sql += ' AND (c.name LIKE ? OR c.cpf LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (!filters.includeInactives) {
      sql += ' AND c.is_active = 1';
    }
    sql += ' ORDER BY c.name ASC LIMIT 50';
    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async findById(id) {
    const [customerRows] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (customerRows.length === 0) return null;
    const customer = customerRows[0];
    const [addressRows] = await db.query('SELECT * FROM addresses WHERE customer_id = ?', [id]);
    const [contactRows] = await db.query('SELECT * FROM contacts WHERE customer_id = ?', [id]);

    return {
      ...customer,
      addresses: addressRows,
      contacts: contactRows,
    };
  }

  static async findByCpf(cpf) {
    const [rows] = await db.query('SELECT * FROM customers WHERE cpf = ?', [cpf]);
    return rows[0];
  }

  static async findByRg(rg) {
    const [rows] = await db.query('SELECT * FROM customers WHERE rg = ?', [rg]);
    return rows[0];
  }

  static async create(data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const customerId = uuidv4();

      const { store_id, name, rg, cpf, birth_date, measurements, notes, addresses, contacts } =
        data;

      await conn.query(
        `INSERT INTO customers (id, store_id, name, rg, cpf, birth_date, measurements, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          store_id || null,
          name,
          rg?.trim() === '' ? null : rg,
          cpf?.trim() === '' ? null : cpf,
          birth_date?.trim() === '' ? null : birth_date,
          JSON.stringify(measurements || {}),
          notes || null,
        ],
      );

      if (addresses && addresses.length > 0) {
        for (const addr of addresses) {
          await conn.query(
            `INSERT INTO addresses (id, customer_id, store_id, type, label, zip_code, street, number, complement, neighborhood, city, state, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              customerId,
              store_id || null,
              addr.type || 'residential',
              addr.label || 'Principal',
              addr.zip_code,
              addr.street,
              addr.number,
              addr.complement || null,
              addr.neighborhood || null,
              addr.city,
              addr.state,
              addr.is_default ? 1 : 0,
            ],
          );
        }
      }

      if (contacts && contacts.length > 0) {
        for (const ct of contacts) {
          await conn.query(
            `INSERT INTO contacts (id, customer_id, store_id, type, value, is_primary) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), customerId, store_id || null, ct.type, ct.value, ct.is_primary ? 1 : 0],
          );
        }
      }

      await conn.commit();
      return { id: customerId, ...data };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Soft Delete a customer.
   */
  static async softDelete(id) {
    const sql = 'UPDATE customers SET deleted_at = NOW(), is_active = false WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Hard Delete a customer (Permanent removal).
   * Make sure the linked tables have ON DELETE CASCADE enabled
   */
  static async hardDelete(id) {
    const sql = 'DELETE FROM customers WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
  }

  static async update(id, data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [existingRows] = await conn.query('SELECT store_id FROM customers WHERE id = ?', [id]);
      const customerStoreId =
        data.store_id !== undefined ? data.store_id : existingRows[0]?.store_id || null;

      const fields = [];
      const values = [];

      if (data.store_id !== undefined) {
        fields.push('store_id = ?');
        values.push(data.store_id || null);
      }
      if (data.name !== undefined) {
        fields.push('name = ?');
        values.push(data.name);
      }
      if (data.rg !== undefined) {
        fields.push('rg = ?');
        values.push(data.rg?.trim() === '' ? null : data.rg);
      }
      if (data.cpf !== undefined) {
        fields.push('cpf = ?');
        values.push(data.cpf?.trim() === '' ? null : data.cpf);
      }
      if (data.birth_date !== undefined) {
        fields.push('birth_date = ?');
        values.push(data.birth_date?.trim() === '' ? null : data.birth_date);
      }
      if (data.measurements !== undefined) {
        fields.push('measurements = ?');
        values.push(JSON.stringify(data.measurements || {}));
      }
      if (data.notes !== undefined) {
        fields.push('notes = ?');
        values.push(data.notes?.trim() === '' ? null : data.notes);
      }
      if (data.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(data.is_active);
      }

      if (fields.length > 0) {
        values.push(id);
        await conn.query(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, values);
      }

      if (data.addresses) {
        await conn.query('DELETE FROM addresses WHERE customer_id = ?', [id]);
        for (const addr of data.addresses) {
          await conn.query(
            `INSERT INTO addresses (id, customer_id, store_id, type, label, zip_code, street, number, complement, neighborhood, city, state, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              id,
              customerStoreId,
              addr.type || 'residential',
              addr.label || 'Principal',
              addr.zip_code,
              addr.street,
              addr.number,
              addr.complement || null,
              addr.neighborhood || null,
              addr.city,
              addr.state,
              addr.is_default ? 1 : 0,
            ],
          );
        }
      }

      if (data.contacts) {
        await conn.query('DELETE FROM contacts WHERE customer_id = ?', [id]);
        for (const ct of data.contacts) {
          await conn.query(
            `INSERT INTO contacts (id, customer_id, store_id, type, value, is_primary) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), id, customerStoreId, ct.type, ct.value, ct.is_primary ? 1 : 0],
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
}

module.exports = CustomerModel;
