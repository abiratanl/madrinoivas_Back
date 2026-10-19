const express = require('express');
const router = express.Router();
const Collection = require('../models/CollectionModel');

router.get('/', async (req, res) => {
  try {
    const { store_id } = req.query;

    const filters = { is_active: true };
    if (store_id) filters.store_id = store_id;

    const collections = await Collection.findAll(filters);

    res.status(200).json({ status: 'success', results: collections.length, data: collections });
  } catch (error) {
    console.error('Error getting public collections:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar coleções.' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { store_id } = req.query;

    if (!store_id) {
      return res.status(400).json({ status: 'error', message: 'Loja não identificada.' });
    }

    const collection = await Collection.findBySlug(slug, store_id);

    if (!collection) {
      return res.status(404).json({ status: 'error', message: 'Coleção não encontrada.' });
    }

    res.status(200).json({ status: 'success', data: collection });
  } catch (error) {
    console.error('Error getting public collection by slug:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

module.exports = router;
