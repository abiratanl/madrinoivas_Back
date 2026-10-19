const Banner = require('../models/BannerModel');

exports.getAllBanners = async (req, res) => {
  try {
    const filters = {};
    if (req.user.storeId) {
      filters.store_id = req.user.storeId;
    } else if (req.query.store_id) {
      filters.store_id = req.query.store_id;
    }

    if (req.query.is_active !== undefined) {
      filters.is_active = req.query.is_active === 'true';
    }

    const banners = await Banner.findAll(filters);
    res.status(200).json({ status: 'success', results: banners.length, data: banners });
  } catch (error) {
    console.error('Error getting banners:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar banners.' });
  }
};

exports.getBannerById = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({ status: 'error', message: 'Banner não encontrado.' });
    }

    if (req.user.storeId && banner.store_id !== req.user.storeId) {
      return res.status(403).json({ status: 'error', message: 'Acesso negado a este banner.' });
    }

    res.status(200).json({ status: 'success', data: banner });
  } catch (error) {
    console.error('Error getting banner:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

exports.createBanner = async (req, res) => {
  try {
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
    } = req.body;

    if (!image_url) {
      return res.status(400).json({ status: 'error', message: 'Imagem é obrigatória.' });
    }

    let finalStoreId;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';

    if (isAdmin) {
      if (!store_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Administradores devem selecionar a Loja.' });
      }
      finalStoreId = store_id;
    } else {
      finalStoreId = req.user.storeId;
    }

    const newBannerId = await Banner.create({
      store_id: finalStoreId,
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
    });

    res.status(201).json({
      status: 'success',
      message: 'Banner criado com sucesso!',
      bannerId: newBannerId,
    });
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao criar banner.' });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const existingBanner = await Banner.findById(id);
    if (!existingBanner) return res.status(404).json({ message: 'Banner não encontrado.' });

    if (req.user.storeId && existingBanner.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Você não tem permissão para editar este banner.' });
    }

    await Banner.update(id, req.body);

    res.status(200).json({ status: 'success', message: 'Banner atualizado com sucesso.' });
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao atualizar banner.' });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const existingBanner = await Banner.findById(id);
    if (!existingBanner) return res.status(404).json({ message: 'Banner não encontrado.' });

    if (req.user.storeId && existingBanner.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Você não tem permissão para excluir este banner.' });
    }

    await Banner.delete(id);

    res.status(200).json({ status: 'success', message: 'Banner removido com sucesso.' });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao deletar banner.' });
  }
};
