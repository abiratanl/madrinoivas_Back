const Collection = require('../models/CollectionModel');

exports.getAllCollections = async (req, res) => {
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

    if (req.query.slug) {
      filters.slug = req.query.slug;
    }

    const collections = await Collection.findAll(filters);
    res.status(200).json({ status: 'success', results: collections.length, data: collections });
  } catch (error) {
    console.error('Error getting collections:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar coleções.' });
  }
};

exports.getCollectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const collection = await Collection.findById(id);

    if (!collection) {
      return res.status(404).json({ status: 'error', message: 'Coleção não encontrada.' });
    }

    if (req.user.storeId && collection.store_id !== req.user.storeId) {
      return res.status(403).json({ status: 'error', message: 'Acesso negado a esta coleção.' });
    }

    res.status(200).json({ status: 'success', data: collection });
  } catch (error) {
    console.error('Error getting collection:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

exports.getCollectionBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const storeId = req.user.storeId || req.query.store_id;

    if (!storeId) {
      return res.status(400).json({ status: 'error', message: 'Loja não identificada.' });
    }

    const collection = await Collection.findBySlug(slug, storeId);

    if (!collection) {
      return res.status(404).json({ status: 'error', message: 'Coleção não encontrada.' });
    }

    res.status(200).json({ status: 'success', data: collection });
  } catch (error) {
    console.error('Error getting collection by slug:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

exports.createCollection = async (req, res) => {
  try {
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
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ status: 'error', message: 'Nome e slug são obrigatórios.' });
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

    const exists = await Collection.slugExists(slug, finalStoreId);
    if (exists) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Já existe uma coleção com este slug nesta loja.' });
    }

    const newCollectionId = await Collection.create({
      store_id: finalStoreId,
      name,
      slug,
      description,
      cover_image_url,
      position,
      is_active,
      start_at,
      end_at,
    });

    res.status(201).json({
      status: 'success',
      message: 'Coleção criada com sucesso!',
      collectionId: newCollectionId,
    });
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao criar coleção.' });
  }
};

exports.updateCollection = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCollection = await Collection.findById(id);
    if (!existingCollection) return res.status(404).json({ message: 'Coleção não encontrada.' });

    if (req.user.storeId && existingCollection.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Você não tem permissão para editar esta coleção.' });
    }

    if (req.body.slug && req.body.slug !== existingCollection.slug) {
      const exists = await Collection.slugExists(req.body.slug, existingCollection.store_id, id);
      if (exists) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Já existe uma coleção com este slug nesta loja.' });
      }
    }

    await Collection.update(id, req.body);

    res.status(200).json({ status: 'success', message: 'Coleção atualizada com sucesso.' });
  } catch (error) {
    console.error('Error updating collection:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao atualizar coleção.' });
  }
};

exports.deleteCollection = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCollection = await Collection.findById(id);
    if (!existingCollection) return res.status(404).json({ message: 'Coleção não encontrada.' });

    if (req.user.storeId && existingCollection.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Você não tem permissão para excluir esta coleção.' });
    }

    await Collection.delete(id);

    res.status(200).json({ status: 'success', message: 'Coleção removida com sucesso.' });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao deletar coleção.' });
  }
};
