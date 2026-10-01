const Store = require('../models/StoreModel');

exports.getAllStores = async (req, res) => {
  try {
    const showInactive = req.query.showInactive === 'true';
    const stores = await Store.findAll(showInactive);
    
    res.status(200).json({ 
        status: 'success', 
        results: stores.length, 
        data: stores 
    });
  } catch (error) {
    console.error('Erro ao buscar lojas:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao listar lojas.' });
  }
};

exports.getStoreById = async (req, res) => {
  try {
    const { id } = req.params;
    const store = await Store.findById(id);

    if (!store) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Loja não encontrada.' 
      });
    }

    res.status(200).json({ 
      status: 'success', 
      data: store 
    });
  } catch (error) {
    console.error('Erro no Controller:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Erro interno ao buscar dados da loja.' 
    });
  }
};

exports.createStore = async (req, res) => {
  try {
    const { name, phone, addresses } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Nome da loja é obrigatório.' 
      });
    }

    const store = await Store.create({ 
      name: name.trim(), 
      phone: phone?.trim() || null, 
      addresses: addresses || [] 
    });

    res.status(201).json({ 
      status: 'success', 
      message: 'Loja criada com sucesso.',
      data: store 
    });
  } catch (error) {
    console.error('Erro ao criar loja:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao criar loja.' });
  }
};

exports.updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, addresses } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Nome da loja é obrigatório.' 
      });
    }

    const updated = await Store.update(id, { 
      name: name.trim(), 
      phone: phone?.trim() || null, 
      addresses: addresses || [] 
    });

    if (!updated) {
      return res.status(404).json({
        status: 'fail',
        message: 'Loja não encontrada ou nenhuma alteração realizada.',
      });
    }

    const updatedStore = await Store.findById(id);
    res.status(200).json({ status: 'success', message: 'Loja atualizada com sucesso', data: updatedStore });
  } catch (error) {
    console.error('Erro ao atualizar loja:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao atualizar loja.' });
  }
};

exports.toggleStoreActive = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Store.toggleActive(id);

    if (!updated) {
      return res.status(404).json({
        status: 'fail',
        message: 'Loja não encontrada.',
      });
    }

    const updatedStore = await Store.findById(id);
    res.status(200).json({ 
      status: 'success', 
      message: `Loja ${updatedStore.is_active ? 'ativada' : 'inativada'} com sucesso`,
      data: updatedStore 
    });
  } catch (error) {
    console.error('Erro ao alternar status da loja:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao alterar status da loja.' });
  }
};