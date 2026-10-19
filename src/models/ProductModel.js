const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ProductModel {
  static async findAll(filters = {}) {
    let query = `
        SELECT p.*, pi.url_thumb as image_url, c.name as category_name, col.name as collection_name, col.slug as collection_slug
        FROM products p
        LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_main = 1
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN collections col ON p.collection_id = col.id
        WHERE 1=1
    `;

    const values = [];

    if (filters.store_id) {
      query += ` AND p.store_id = ?`;
      values.push(filters.store_id);
    }

    if (filters.category_id && filters.category_id !== '') {
      query += ` AND p.category_id = ?`;
      values.push(filters.category_id);
    }

    if (filters.collection_id && filters.collection_id !== '') {
      query += ` AND p.collection_id = ?`;
      values.push(filters.collection_id);
    }

    if (filters.status && filters.status !== '') {
      query += ` AND p.status = ?`;
      values.push(filters.status);
    }

    if (filters.is_featured !== undefined) {
      query += ` AND p.is_featured = ?`;
      values.push(filters.is_featured ? 1 : 0);
    }

    query += ` ORDER BY p.created_at DESC`;

    const [rows] = await db.execute(query, values);
    return rows;
  }

  static async findById(id) {
    const sql = `
      SELECT p.*, c.name as category_name, col.name as collection_name, col.slug as collection_slug, s.name as store_name 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN collections col ON p.collection_id = col.id
      JOIN stores s ON p.store_id = s.id
      WHERE p.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    return rows[0];
  }

  static async getImagesByProductId(productId) {
    const sql = `
        SELECT * FROM product_images 
        WHERE product_id = ? 
        ORDER BY is_main DESC, created_at ASC
      `;
    const [rows] = await db.query(sql, [productId]);
    return rows;
  }

  static async deleteImages(productId, imageIdsToKeep = []) {
    const currentImages = await this.getImagesByProductId(productId);
    const idsToKeepSet = new Set(imageIdsToKeep);
    
    const toDelete = currentImages.filter(img => !idsToKeepSet.has(img.id));
    
    if (toDelete.length === 0) return;
    
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const r2Client = new S3Client({
        region: 'auto',
        endpoint: process.env.AWS_ENDPOINT,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    
    const baseUrl = process.env.AWS_URL.replace(/\/$/, '');
    const bucket = process.env.AWS_BUCKET;
    
    const extractKey = (url) => {
        const prefix = `${baseUrl}/`;
        return url.startsWith(prefix) ? url.slice(prefix.length) : null;
    };
    
    for (const img of toDelete) {
        const fullKey = extractKey(img.url_full);
        const thumbKey = extractKey(img.url_thumb);
        
        if (fullKey) {
            await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fullKey }));
        }
        if (thumbKey) {
            await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey }));
        }
    }
    
    const deleteIds = toDelete.map(img => img.id);
    const placeholders = deleteIds.map(() => '?').join(',');
    await db.query(`DELETE FROM product_images WHERE id IN (${placeholders})`, deleteIds);

    const deletedMain = toDelete.some(img => img.is_main === 1);
    if (deletedMain && imageIdsToKeep.length > 0) {
      await db.query(
        `UPDATE product_images SET is_main = 1 WHERE id = ?`,
        [imageIdsToKeep[0]]
      );
    }
  }

  static async resetMainImage(productId) {
    const sql = `UPDATE product_images SET is_main = 0 WHERE product_id = ?`;
    await db.query(sql, [productId]);
  }

  static async setMainImage(productId, imageId) {
    await this.resetMainImage(productId);
    const sql = `UPDATE product_images SET is_main = 1 WHERE id = ? AND product_id = ?`;
    await db.query(sql, [imageId, productId]);
  }

  static async addImages(productId, imagesArray) {
    if (!imagesArray || imagesArray.length === 0) return;

    const sql = `
        INSERT INTO product_images (id, product_id, url_thumb, url_full, is_main) 
        VALUES ?
      `;

    const values = imagesArray.map((img) => [
      img.id,
      productId,
      img.url_thumb,
      img.url_full,
      img.is_main,
    ]);

    await db.query(sql, [values]);
  }

  static async create(data) {
    const id = uuidv4();
    const {
      store_id,
      category_id,
      collection_id,
      code,
      name,
      description,
      size,
      color,
      brand,
      purchase_price,
      rental_price,
      status,
      is_featured,
    } = data;

    const sql = `
      INSERT INTO products (
        id, store_id, category_id, collection_id, code, name, description, 
        size, color, brand, purchase_price, rental_price, 
        status, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(sql, [
      id,
      store_id,
      category_id || null,
      collection_id || null,
      code,
      name,
      description || null,
      size || null,
      color || null,
      brand || null,
      purchase_price || 0,
      rental_price || 0,
      status || 'available',
      is_featured ? 1 : 0,
    ]);

    return id;
  }

  static async update(id, data, connection = null) {
    const fields = [];
    const values = [];

    const allowedFields = [
      'category_id',
      'collection_id',
      'code',
      'name',
      'description',
      'size',
      'color',
      'brand',
      'purchase_price',
      'rental_price',
      'status',
      'store_id',
      'is_featured',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return false;

    values.push(id);
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;

    const executor = connection || db;
    const [result] = await executor.query(sql, values);
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const sql = 'DELETE FROM products WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = ProductModel;