const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class TransferModel {
  static async create(data) {
    const id = uuidv4();
    const { product_id, from_store_id, to_store_id, requested_by, notes } = data;

    const sql = `
      INSERT INTO product_transfers (
        id, product_id, from_store_id, to_store_id, requested_by, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'active')
    `;

    await db.query(sql, [id, product_id, from_store_id, to_store_id, requested_by, notes || null]);
    return { id, ...data, status: 'active' };
  }

  static async findById(id) {
    const sql = `
      SELECT 
        t.id as transfer_id,
        t.product_id,
        t.from_store_id,
        t.to_store_id,
        t.requested_by,
        t.received_by,
        t.status as transfer_status,
        t.notes,
        t.requested_at,
        t.received_at,
        p.*,
        c.name as category_name,
        pi.url_thumb as image_url,
        s_from.name as from_store_name,
        s_to.name as to_store_name,
        u_req.name as requested_by_name,
        u_rec.name as received_by_name
      FROM product_transfers t
      JOIN products p ON t.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_main = 1
      JOIN stores s_from ON t.from_store_id = s_from.id
      JOIN stores s_to ON t.to_store_id = s_to.id
      LEFT JOIN users u_req ON t.requested_by = u_req.id
      LEFT JOIN users u_rec ON t.received_by = u_rec.id
      WHERE t.id = ?
    `;
    const [rows] = await db.query(sql, [id]);
    if (!rows[0]) return null;
    
    const row = rows[0];
    const product = {
      id: row.product_id,
      product_id: row.product_id,
      code: row.code,
      name: row.name,
      description: row.description,
      size: row.size,
      color: row.color,
      brand: row.brand,
      model: row.model,
      purchase_price: row.purchase_price,
      rental_price: row.rental_price,
      sale_price: row.sale_price,
      accessories: row.accessories,
      status: row.status,
      category_id: row.category_id,
      store_id: row.store_id,
      is_featured: row.is_featured,
      created_at: row.created_at,
      updated_at: row.updated_at,
      category_name: row.category_name,
      image_url: row.image_url,
      images: []
    };
    
    const { 
      code, name, description, size, color, brand, model, 
      purchase_price, rental_price, sale_price, accessories,
      category_id, store_id, is_featured, 
      category_name, image_url,
      from_store_name, to_store_name, 
      requested_by_name, received_by_name,
      ...transferFields 
    } = row;
    
    transferFields.product = product;
    transferFields.status = row.transfer_status;
    
    return transferFields;
  }

  /**
   * Lista transferências. Útil para mostrar "A chegar" na loja de destino.
   * Inclui o objeto produto completo (com category_name, image_url, etc.)
   */
  static async findAll(filters = {}) {
    let sql = `
      SELECT 
        t.id as transfer_id,
        t.product_id,
        t.from_store_id,
        t.to_store_id,
        t.requested_by,
        t.received_by,
        t.status as transfer_status,
        t.notes,
        t.requested_at,
        t.received_at,
        p.*,
        c.name as category_name,
        pi.url_thumb as image_url,
        s_from.name as from_store_name, 
        s_to.name as to_store_name,
        u_req.name as requested_by_name,
        u_rec.name as received_by_name
      FROM product_transfers t
      JOIN products p ON t.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_main = 1
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
    
    // Transformar linhas planas em objeto com product aninhado
    return rows.map(row => {
      const product = {
        id: row.product_id,
        product_id: row.product_id,
        code: row.code,
        name: row.name,
        description: row.description,
        size: row.size,
        color: row.color,
        brand: row.brand,
        model: row.model,
        purchase_price: row.purchase_price,
        rental_price: row.rental_price,
        sale_price: row.sale_price,
        accessories: row.accessories,
        status: row.status,
        category_id: row.category_id,
        store_id: row.store_id,
        is_featured: row.is_featured,
        created_at: row.created_at,
        updated_at: row.updated_at,
        category_name: row.category_name,
        image_url: row.image_url,
        images: [] // não incluímos imagens adicionais aqui para evitar duplicação
      };
      
      // Extrair apenas campos da transferência (não do produto)
      const { 
        code, name, description, size, color, brand, model, 
        purchase_price, rental_price, sale_price, accessories,
        category_id, store_id, is_featured, 
        category_name, image_url,
        // campos de join que não são da transferência
        from_store_name, to_store_name, 
        requested_by_name, received_by_name,
        ...transferFields 
      } = row;
      
      // Renomear id do produto para não conflitar com id da transferência
      transferFields.product = product;
      transferFields.product.id = row.product_id;
      transferFields.status = row.transfer_status;
      
      return transferFields;
    });
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