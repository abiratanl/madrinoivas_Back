const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ProductModel {
  // --- LEITURA ---

  // No arquivo ProductModel.js

  static async findAll(filters = {}) {
    let query = `
        SELECT p.*, pi.url_thumb as image_url, c.name as category_name
        FROM products p
        LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_main = 1
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE 1=1
    `;

    const values = [];

    // 1. Filtro de Loja (Se o usuário tiver loja fixa, filtra. Se for Admin Global, vê tudo)
    // Se você quer ver TUDO para testar, comente este bloco temporariamente.
    if (filters.store_id) {
      query += ` AND p.store_id = ?`;
      values.push(filters.store_id);
    }

    // 2. Filtro de Categoria (Aqui está o conserto do dropdown)
    // O Frontend manda 'category_id', o backend tem que usar isso.
    if (filters.category_id && filters.category_id !== '') {
      query += ` AND p.category_id = ?`;
      values.push(filters.category_id);
    }

    // 3. Filtro de Status
    if (filters.status && filters.status !== '') {
      query += ` AND p.status = ?`;
      values.push(filters.status);
    }

    query += ` ORDER BY p.created_at DESC`;

    // Debug: Mostra no terminal a query que está sendo feita
    console.log('Query Produtos:', query, values);

    const [rows] = await db.execute(query, values);
    return rows;
  }
  static async findById(id) {
    // Aqui trazemos apenas os dados crus do produto.
    // As imagens são buscadas separadamente pelo controller usando getImagesByProductId
    const sql = `
      SELECT p.*, c.name as category_name, s.name as store_name 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      JOIN stores s ON p.store_id = s.id
      WHERE p.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    return rows[0];
  }

  // --- IMAGENS (NOVO) ---

  // Busca todas as fotos de um produto específico
  static async getImagesByProductId(productId) {
    const sql = `
        SELECT * FROM product_images 
        WHERE product_id = ? 
        ORDER BY is_main DESC, created_at ASC
      `;
    const [rows] = await db.query(sql, [productId]);
    return rows;
  }

  // Deleta imagens do R2 e do BD
  static async deleteImages(productId, imageIdsToKeep = []) {
    // Busca imagens atuais
    const currentImages = await this.getImagesByProductId(productId);
    const idsToKeepSet = new Set(imageIdsToKeep);
    
    // Filtra imagens para deletar (não estão na lista de manter)
    const toDelete = currentImages.filter(img => !idsToKeepSet.has(img.id));
    
    if (toDelete.length === 0) return;
    
    // Delete from R2
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
    
    // Delete from DB
    const deleteIds = toDelete.map(img => img.id);
    const placeholders = deleteIds.map(() => '?').join(',');
    await db.query(`DELETE FROM product_images WHERE id IN (${placeholders})`, deleteIds);
  }

  // Insere múltiplas imagens de uma vez (Bulk Insert)
  static async addImages(productId, imagesArray) {
    if (!imagesArray || imagesArray.length === 0) return;

    const sql = `
        INSERT INTO product_images (id, product_id, url_thumb, url_full, is_main) 
        VALUES ?
      `;

    // Prepara o array de arrays para o mysql2 fazer o bulk insert
    const values = imagesArray.map((img) => [
      img.id, // ID gerado no middleware (ou gere um novo aqui: uuidv4())
      productId,
      img.url_thumb,
      img.url_full,
      img.is_main,
    ]);

    await db.query(sql, [values]);
  }

  // --- ESCRITA ---

  static async create(data) {
    const id = uuidv4();
    const {
      store_id,
      category_id,
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
        id, store_id, category_id, code, name, description, 
        size, color, brand, purchase_price, rental_price, 
        status, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(sql, [
      id,
      store_id,
      category_id,
      code,
      name,
      description,
      size,
      color,
      brand,
      purchase_price || 0,
      rental_price || 0,
      status || 'available',
      is_featured ? 1 : 0,
    ]);

    // Retorna o ID para que o Controller possa vincular as imagens
    return id;
  }

  static async update(id, data, connection = null) {
    const fields = [];
    const values = [];

    // Lista atualizada de campos permitidos na tabela products
    const allowedFields = [
      'category_id',
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

    // Use provided connection or default pool
    const executor = connection || db;
    const [result] = await executor.query(sql, values);
    return result.affectedRows > 0;
  }

  static async delete(id) {
    // Graças ao ON DELETE CASCADE no banco, ao deletar o produto,
    // as imagens na tabela product_images somem sozinhas do SQL.
    const sql = 'DELETE FROM products WHERE id = ?';
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
  }
}

module.exports = ProductModel;
