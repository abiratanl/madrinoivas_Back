const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class BannerModel {
  static async findAll(filters = {}) {
    let query = `
      SELECT b.*, c.name as collection_name, c.slug as collection_slug
      FROM banners b
      LEFT JOIN collections c ON b.collection_id = c.id
      WHERE 1=1
    `;

    const values = [];

    if (filters.store_id) {
      query += ` AND b.store_id = ?`;
      values.push(filters.store_id);
    }

    if (filters.is_active !== undefined) {
      query += ` AND b.is_active = ?`;
      values.push(filters.is_active ? 1 : 0);
    }

    const now = new Date();
    query += ` AND (b.start_at IS NULL OR b.start_at <= ?) AND (b.end_at IS NULL OR b.end_at >= ?)`;
    values.push(now, now);

    query += ` ORDER BY b.position ASC, b.created_at DESC`;

    const [rows] = await db.execute(query, values);
    return rows;
  }

  static async findById(id) {
    const sql = `
      SELECT b.*, c.name as collection_name, c.slug as collection_slug, s.name as store_name
      FROM banners b
      LEFT JOIN collections c ON b.collection_id = c.id
      JOIN stores s ON b.store_id = s.id
      WHERE b.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    return rows[0];
  }

  static async create(data) {
    const id = uuidv4();
    const {
      store_id,
      title,
      subtitle,
      image_url,
      mobile_image_url,
      link_url,
      collection_id,
      button_text,
      button_variant,
      overlay_position,
      overlay_bg_color,
      text_color,
      position,
      is_active,
      start_at,
      end_at,
      target_blank,
    } = data;

    const sql = `
      INSERT INTO banners (
        id, store_id, title, subtitle, image_url, mobile_image_url,
        link_url, collection_id, button_text, button_variant,
        overlay_position, overlay_bg_color, text_color,
        position, is_active, start_at, end_at, target_blank
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(sql, [
      id,
      store_id,
      title || null,
      subtitle || null,
      image_url,
      mobile_image_url || null,
      link_url || null,
      collection_id || null,
      button_text || null,
      button_variant || 'primary',
      overlay_position || 'center',
      overlay_bg_color || null,
      text_color || '#FFFFFF',
      position || 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      start_at || null,
      end_at || null,
      target_blank ? 1 : 0,
    ]);

    return id;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const allowedFields = [
      'title',
      'subtitle',
      'image_url',
      'mobile_image_url',
      'link_url',
      'collection_id',
      'button_text',
      'button_variant',
      'overlay_position',
      'overlay_bg_color',
      'text_color',
      'position',
      'is_active',
      'start_at',
      'end_at',
      'target_blank',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return false;

    values.push(id);
    const sql = `UPDATE banners SET ${fields.join(', ')} WHERE id = ?`;

    const [result] = await db.query(sql, values);
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const sql = 'DELETE FROM banners WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = BannerModel;
