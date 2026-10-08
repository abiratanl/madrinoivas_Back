const Transfer = require('../models/TransferModel');
const Product = require('../models/ProductModel'); // Precisamos atualizar o produto

// 1. Solicitar Transferência (Inicia o processo)
exports.requestTransfer = async (req, res) => {
  try {
    const { product_id, to_store_id } = req.body;
    const requesterId = req.user.id;

    if (!product_id || !to_store_id) {
      return res.status(400).json({ message: 'ID do produto e Loja de destino são obrigatórios.' });
    }

    // Buscar produto para validar
    const product = await Product.findById(product_id);

    if (!product) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    if (product.status !== 'available') {
      return res.status(400).json({ message: `Produto não está disponível (Status atual: ${product.status}).` });
    }

    if (product.store_id === to_store_id) {
      return res.status(400).json({ message: 'O produto já se encontra na loja de destino.' });
    }

    // --- LÓGICA DE TRANSAÇÃO ---
    
    // A. Atualiza status do produto para 'transferring' (Bloqueia alugueres)
    await Product.update(product_id, { status: 'transferring' });

    // B. Cria registo de transferência
    const newTransfer = await Transfer.create({
      product_id,
      from_store_id: product.store_id,
      to_store_id,
      requested_by: requesterId
    });

    res.status(201).json({ 
      status: 'success', 
      message: 'Transferência iniciada. Produto em trânsito.',
      data: newTransfer 
    });

  } catch (error) {
    console.error('Erro ao solicitar transferência:', error);
    // Idealmente, faríamos rollback aqui se o passo A funcionasse e o B falhasse
    res.status(500).json({ status: 'error', message: 'Erro interno ao processar transferência.' });
  }
};

// 2. Receber Produto (Finaliza o processo)
exports.receiveTransfer = async (req, res) => {
  try {
    const { transfer_id } = req.body;
    const userId = req.user.id;
    const userStoreId = req.user.storeId;

    const transfer = await Transfer.findById(transfer_id);

    if (!transfer) {
      return res.status(404).json({ message: 'Transferência não encontrada.' });
    }

    if (transfer.status !== 'active') {
      return res.status(400).json({ message: 'Esta transferência já foi concluída ou cancelada.' });
    }

    // Segurança: Apenas alguém da loja de destino pode confirmar o recebimento
    // (A menos que seja admin ou owner global)
    const userRole = req.user.role;
    const isAdminOrOwner = userRole === 'admin' || userRole === 'owner' || userRole === 'proprietario';
    
    if (userStoreId && userStoreId !== transfer.to_store_id && !isAdminOrOwner) {
      return res.status(403).json({ message: 'Apenas funcionários da loja de destino podem receber o produto.' });
    }

    // --- LÓGICA DE FINALIZAÇÃO ---

    // A. Atualiza o produto: Novo dono (store_id) e volta a ficar disponível
    await Product.update(transfer.product_id, {
      store_id: transfer.to_store_id, 
      status: 'available'
    });

    // B. Atualiza a transferência para concluída
    await Transfer.updateStatus(transfer_id, 'completed', new Date(), userId);

    res.status(200).json({ 
      status: 'success', 
      message: 'Produto recebido com sucesso! Estoque atualizado.' 
    });

  } catch (error) {
    console.error('Erro ao receber transferência:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

// 3. Listar Transferências (Pendentes ou Histórico)
exports.getMyTransfers = async (req, res) => {
  try {
    const filters = {};
    const userStoreId = req.user.storeId;

    // Se for funcionário de loja, vê o que está a chegar (to) ou o que enviou (from)
    if (userStoreId) {
      // Simplificação: vamos buscar o que está "Para mim"
      filters.to_store_id = userStoreId;
    }
    
    // Podemos passar status via query (ex: ?status=active)
    if (req.query.status) {
      filters.status = req.query.status;
    }

    const transfers = await Transfer.findAll(filters);
    res.status(200).json({ status: 'success', data: transfers });

  } catch (error) {
    console.error('Erro ao listar transferências:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

// 4. Iniciar Transferência a partir do Produto (Frontend: POST /products/:productId/transfer)
exports.requestTransferFromProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { to_store_id, notes } = req.body;
    const requesterId = req.user.id;

    if (!to_store_id) {
      return res.status(400).json({ message: 'Loja de destino é obrigatória.' });
    }

    // Buscar produto para validar
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    // Permitir transferência de: available, reserved, maintenance
    const allowedStatuses = ['available', 'reserved', 'maintenance'];
    if (!allowedStatuses.includes(product.status)) {
      return res.status(400).json({ message: `Produto não pode ser transferido (Status atual: ${product.status}).` });
    }

    if (product.store_id === to_store_id) {
      return res.status(400).json({ message: 'O produto já se encontra na loja de destino.' });
    }

    // A. Atualiza status do produto para 'transferring'
    await Product.update(productId, { status: 'transferring' });

    // B. Cria registo de transferência
    const newTransfer = await Transfer.create({
      product_id: productId,
      from_store_id: product.store_id,
      to_store_id,
      requested_by: requesterId,
      notes: notes || null
    });

    res.status(201).json({ 
      status: 'success', 
      message: 'Transferência iniciada. Produto em trânsito.',
      data: newTransfer 
    });

  } catch (error) {
    console.error('Erro ao solicitar transferência:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao processar transferência.' });
  }
};

// 5. Receber Transferência a partir do Produto (Frontend: POST /products/:productId/receive)
exports.receiveTransferFromProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { transfer_id } = req.body;
    const userId = req.user.id;
    const userStoreId = req.user.storeId;

    const transfer = await Transfer.findById(transfer_id);

    if (!transfer) {
      return res.status(404).json({ message: 'Transferência não encontrada.' });
    }

    if (transfer.product_id !== productId) {
      return res.status(400).json({ message: 'Transferência não corresponde a este produto.' });
    }

    if (transfer.status !== 'active') {
      return res.status(400).json({ message: 'Esta transferência já foi concluída ou cancelada.' });
    }

    // Segurança: Apenas alguém da loja de destino pode confirmar o recebimento
    // (A menos que seja admin ou owner global)
    const userRole = req.user.role;
    const isAdminOrOwner = userRole === 'admin' || userRole === 'owner' || userRole === 'proprietario';
    
    if (userStoreId && userStoreId !== transfer.to_store_id && !isAdminOrOwner) {
      return res.status(403).json({ message: 'Apenas funcionários da loja de destino podem receber o produto.' });
    }

    // A. Atualiza o produto: Novo dono (store_id) e volta a ficar disponível
    await Product.update(transfer.product_id, {
      store_id: transfer.to_store_id, 
      status: 'available'
    });

    // B. Atualiza a transferência para concluída
    await Transfer.updateStatus(transfer_id, 'completed', new Date(), userId);

    res.status(200).json({ 
      status: 'success', 
      message: 'Produto recebido com sucesso! Estoque atualizado.' 
    });

  } catch (error) {
    console.error('Erro ao receber transferência:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

// 6. Listar Transferências de um Produto (Frontend: GET /products/:productId/transfers)
exports.getTransfersByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Reutiliza o findAll filtrando por product_id
    const transfers = await Transfer.findAll({ product_id: productId });
    res.status(200).json({ status: 'success', data: transfers });

  } catch (error) {
    console.error('Erro ao listar transferências do produto:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

module.exports = exports;