const express = require('express');
const router = express.Router();
const Product = require('../models/ProductModel');

router.get('/', async (req, res) => {
  try {
    const { store_id, category_id, collection_id, status, is_featured } = req.query;

    const filters = {};
    if (store_id) filters.store_id = store_id;
    if (category_id) filters.category_id = category_id;
    if (collection_id) filters.collection_id = collection_id;
    if (status) filters.status = status;
    if (is_featured !== undefined) filters.is_featured = is_featured === 'true';

    const products = await Product.findAll(filters);

    res.status(200).json({ status: 'success', results: products.length, data: products });
  } catch (error) {
    console.error('Error getting public products:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar produtos.' });
  }
});

module.exports = router;
