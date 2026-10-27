const Product = require('../models/ProductModel');
const {
  isGlobalRole,
  getUserStoreId,
  resolveStoreId,
  canAccessStore,
} = require('../middlewares/storeScopeMiddleware');

exports.getAllProducts = async (req, res) => {
  try {
    const filters = {};

    // ============================================================
    // LÓGICA DE FILTRO DE LOJA (CORRIGIDA)
    // ============================================================

    // 1. Busca global é exclusiva de admin/owner (visão consolidada da rede).
    const requestedGlobal = req.query.global_search === 'true' || req.query.global_search === true;
    const isGlobal = requestedGlobal && isGlobalRole(req.user);

    if (!isGlobal) {
      const storeId = resolveStoreId(req.user, req.query.store_id);
      if (storeId) filters.store_id = storeId;
    }

    // ============================================================
    // OTHER FILTERS
    // ============================================================

    if (req.query.category_id) filters.category_id = req.query.category_id;
    if (req.query.collection_id) filters.collection_id = req.query.collection_id;
    if (req.query.status) filters.status = req.query.status;

    // Home Page filter (Featured)
    if (req.query.is_featured) filters.is_featured = req.query.is_featured === 'true';

    // Search in Model (which already does JOIN with images and categories)
    const products = await Product.findAll(filters);

    res.status(200).json({ status: 'success', results: products.length, data: products });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar produtos.' });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get product data
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Produto não encontrado.' });
    }

    if (!canAccessStore(req.user, product.store_id)) {
      return res.status(403).json({ status: 'error', message: 'Acesso negado a este produto.' });
    }

    // 2. Get gallery images
    const images = await Product.getImagesByProductId(id);

    // Return product with images array
    res.status(200).json({
      status: 'success',
      data: {
        ...product,
        images: images,
      },
    });
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const {
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
      store_id,
      is_featured,
    } = req.body;

    // Basic Validations
    if (!name || !rental_price || !code) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Nome, Código e Preço são obrigatórios.' });
    }

    // --- STORE PERMISSION LOGIC (CHANGE HERE) ---
    let finalStoreId;

    if (isGlobalRole(req.user)) {
      // Admin/owner MUST send store_id via dropdown
      if (!store_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Administradores devem selecionar a Loja.' });
      }
      finalStoreId = store_id;
    } else {
      // Scoped users (local_manager/attendant) always use their own store
      finalStoreId = getUserStoreId(req.user);
    }

    if (!finalStoreId) {
      return res.status(403).json({
        status: 'error',
        message: 'Usuário sem loja vinculada. Contate o administrador.',
      });
    }

    // 1. Create Product
    const newProductId = await Product.create({
      store_id: finalStoreId,
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
      is_featured: is_featured === 'true' || is_featured === true ? 1 : 0,
    });

    // 2. Save images (if any processed by middleware)
    if (req.processedImages && req.processedImages.length > 0) {
      await Product.addImages(newProductId, req.processedImages);
    }

    res.status(201).json({
      status: 'success',
      message: 'Produto cadastrado com sucesso!',
      productId: newProductId,
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao criar produto.' });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Check existence
    const existingProduct = await Product.findById(id);
    if (!existingProduct) return res.status(404).json({ message: 'Produto não encontrado.' });

    if (!canAccessStore(req.user, existingProduct.store_id)) {
      return res.status(403).json({ message: 'Você não tem permissão para editar este produto.' });
    }

    const data = { ...req.body };
    if (!isGlobalRole(req.user)) {
      delete data.store_id;
    }

    // 1. Update text data
    await Product.update(id, data);

    // 2. Manage images: delete removed, add new
    const keepIds = req.body.existing_photo_ids ? JSON.parse(req.body.existing_photo_ids) : [];

    // Delete from R2 and DB images not in keep list
    await Product.deleteImages(id, keepIds);

    // Add new images (if any)
    if (req.processedImages && req.processedImages.length > 0) {
      // If there are new images, reset is_main for all existing images
      // to avoid duplicates in listing (multiple is_main = 1)
      await Product.resetMainImage(id);
      await Product.addImages(id, req.processedImages);
    }

    // Always apply main image selection (main_photo_index)
    // Index is global (existing + new images)
    if (
      (keepIds.length > 0 || (req.processedImages && req.processedImages.length > 0)) &&
      req.body.main_photo_index !== undefined
    ) {
      const mainIndex = parseInt(req.body.main_photo_index) || 0;

      let mainImageId = null;

      if (mainIndex < keepIds.length) {
        // Main image is among kept existing images
        mainImageId = keepIds[mainIndex];
      } else if (req.processedImages && req.processedImages.length > 0) {
        // Main image is among new images
        const newImageIndex = mainIndex - keepIds.length;
        if (newImageIndex >= 0 && newImageIndex < req.processedImages.length) {
          mainImageId = req.processedImages[newImageIndex].id;
        }
      }

      if (mainImageId) {
        await Product.setMainImage(id, mainImageId);
      } else if (keepIds.length > 0) {
        // Fallback: first kept image
        await Product.setMainImage(id, keepIds[0]);
      } else if (req.processedImages && req.processedImages.length > 0) {
        // Fallback: first new image
        await Product.setMainImage(id, req.processedImages[0].id);
      }
    }

    res.status(200).json({ status: 'success', message: 'Produto atualizado com sucesso.' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao atualizar produto.' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await Product.findById(id);
    if (!existingProduct) return res.status(404).json({ message: 'Produto não encontrado.' });

    if (!canAccessStore(req.user, existingProduct.store_id)) {
      return res.status(403).json({ message: 'Você não tem permissão para excluir este produto.' });
    }

    // Product delete triggers CASCADE on images table
    await Product.delete(id);

    res.status(200).json({ status: 'success', message: 'Produto removido com sucesso.' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao deletar produto.' });
  }
};
