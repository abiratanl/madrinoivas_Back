const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class CollectionModel {
  static async findAll(filters = {}) {
    let query = `
      SELECT c.*, COUNT(p.id) as products_count
      FROM collections c
      LEFT JOIN products p ON p.collection_id = c.id AND p.status = 'available'
      WHERE 1=1
    `;

    const values = [];

    if (filters.store_id) {
      query += ` AND c.store_id = ?`;
      values.push(filters.store_id);
    }

    if (filters.is_active !== undefined) {
      query += ` AND c.is_active = ?`;
      values.push(filters.is_active ? 1 : 0);
    }

    if (filters.slug) {
      query += ` AND c.slug = ?`;
      values.push(filters.slug);
    }

    const now = new Date();
    query += ` AND (c.start_at IS NULL OR c.start_at <= ?) AND (c.end_at IS NULL OR c.end_at >= ?)`;
    values.push(now, now);

    query += ` GROUP BY c.id ORDER BY c.position ASC, c.created_at DESC`;

    const [rows] = await db.execute(query, values);
    return rows;
  }

  static async findById(id) {
    const sql = `
      SELECT c.*, s.name as store_name
      FROM collections c
      JOIN stores s ON c.store_id = s.id
      WHERE c.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    return rows[0];
  }

  static async findBySlug(slug, storeId) {
    const sql = `
      SELECT c.*, COUNT(p.id) as products_count
      FROM collections c
      LEFT JOIN products p ON p.collection_id = c.id AND p.status = 'available'
      WHERE c.slug = ? AND c.store_id = ?
        AND (c.start_at IS NULL OR c.start_at <= NOW())
        AND (c.end_at IS NULL OR c.end_at >= NOW())
      GROUP BY c.id
    `;
    const [rows] = await db.query(sql, [slug, storeId]);
    return rows[0];
  }

  static async create(data) {
    const id = uuidv4();
    const {
      store_id,
      name,
      slug,
      description,
      cover_image_url,
      position,
      is_active,
      start_at,
      end_at,
    } = data;

    const sql = `
      INSERT INTO collections (
        id, store_id, name, slug, description, cover_image_url,
        position, is_active, start_at, end_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(sql, [
      id,
      store_id,
      name,
      slug,
      description || null,
      cover_image_url || null,
      position || 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      start_at || null,
      end_at || null,
    ]);

    return id;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const allowedFields = [
      'name',
      'slug',
      'description',
      'cover_image_url',
      'position',
      'is_active',
      'start_at',
      'end_at',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return false;

    values.push(id);
    const sql = `UPDATE collections SET ${fields.join(', ')} WHERE id = ?`;

    const [result] = await db.query(sql, values);
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const sql = 'DELETE FROM collections WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
  }

  static async slugExists(slug, storeId, excludeId = null) {
    let sql = `SELECT id FROM collections WHERE slug = ? AND store_id = ?`;
    const values = [slug, storeId];

    if (excludeId) {
      sql += ` AND id != ?`;
      values.push(excludeId);
    }

    const [rows] = await db.query(sql, values);
    return rows.length > 0;
  }
}

module.exports = CollectionModel;
