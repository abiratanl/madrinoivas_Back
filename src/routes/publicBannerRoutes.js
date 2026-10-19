const express = require('express');
const router = express.Router();
const Banner = require('../models/BannerModel');

router.get('/', async (req, res) => {
  try {
    const { store_id } = req.query;

    const filters = { is_active: true };
    if (store_id) filters.store_id = store_id;

    const banners = await Banner.findAll(filters);

    res.status(200).json({ status: 'success', results: banners.length, data: banners });
  } catch (error) {
    console.error('Error getting public banners:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar banners.' });
  }
});

module.exports = router;
