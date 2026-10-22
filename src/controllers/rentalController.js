const Rental = require('../models/RentalModel');
const Product = require('../models/ProductModel'); // Opcional: para validar se produtos existem

/**
 * Validates the optional fitting date (prova do traje) against the rental dates.
 * The fitting must be a valid date, on or before the pickup date (start_date,
 * same day allowed) and on or after the rental creation date (comparing dates
 * only, ignoring time).
 * Returns a PT-BR error message, or null when valid.
 */
function validateFittingDate(fittingDate, startDate, createdAt) {
  const fitting = new Date(fittingDate);
  if (Number.isNaN(fitting.getTime())) {
    return 'Data da prova inválida.';
  }

  const endOfStartDate = new Date(startDate);
  endOfStartDate.setHours(23, 59, 59, 999);
  if (fitting > endOfStartDate) {
    return 'A data da prova deve ser anterior ou igual à data de retirada.';
  }

  const creationDay = new Date(createdAt);
  creationDay.setHours(0, 0, 0, 0);
  if (fitting < creationDay) {
    return 'A data da prova deve ser posterior ou igual à data de criação do aluguel.';
  }

  return null;
}

exports.createRental = async (req, res) => {
  try {
    const {
      customer_id,
      products, // Array de IDs ou objetos
      start_date,
      end_date_scheduled,
      store_id, // Opcional se for attendant
    } = req.body;

    // 1. Validações Básicas
    if (!customer_id || !products || products.length === 0) {
      return res.status(400).json({ message: 'Cliente e Produtos são obrigatórios.' });
    }
    if (!start_date || !end_date_scheduled) {
      return res.status(400).json({ message: 'Datas de retirada e devolução são obrigatórias.' });
    }

    // Data da prova (opcional): entre a data de criação e a data de retirada
    if (req.body.fitting_date) {
      const fittingError = validateFittingDate(req.body.fitting_date, start_date, new Date());
      if (fittingError) return res.status(400).json({ message: fittingError });
    }

    // 2. Define a Loja
    const finalStoreId = req.user.storeId || store_id;
    if (!finalStoreId) {
      return res.status(400).json({ message: 'Loja não identificada.' });
    }

    // 3. Preparar itens (buscar preço atual se não enviado)
    // Isso é importante: o frontend manda o ID, o backend busca o preço "oficial" do banco para segurança
    const itemsToSave = [];
    for (const item of products) {
      // Supondo que 'products' seja array de { id: '...', quantity: 1 }
      const productDb = await Product.findById(item.id);

      if (!productDb) {
        return res.status(404).json({ message: `Produto ID ${item.id} não encontrado.` });
      }

      // Validação de Status (se não for orçamento)
      if (req.body.status !== 'budget' && productDb.status !== 'available') {
        return res.status(400).json({ message: `Produto ${productDb.name} não está disponível.` });
      }

      itemsToSave.push({
        product_id: productDb.id,
        unit_price: productDb.rental_price, // Pega o preço do cadastro do produto
        quantity: 1, // Por enquanto 1, trajes costumam ser únicos
      });
    }

    // 4. Chamar Model
    const result = await Rental.createTransaction({
      ...req.body,
      store_id: finalStoreId,
      user_id: req.user.id, // Vendedor logado
      items: itemsToSave,
    });

    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    console.error('Error creating rental:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao processar aluguel.' });
  }
};

exports.getRentalById = async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id);
    if (!rental) return res.status(404).json({ message: 'Aluguel não encontrado' });

    // Segurança: Atendente só vê da sua loja
    if (req.user.storeId && rental.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    res.status(200).json({ status: 'success', data: rental });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro interno' });
  }
};

exports.getAllRentals = async (req, res) => {
  try {
    const filters = {};
    if (req.user.storeId) filters.store_id = req.user.storeId;
    if (req.query.status) filters.status = req.query.status;

    const rentals = await Rental.findAll(filters);
    res.status(200).json({ status: 'success', data: rentals });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro interno' });
  }
};

exports.updateRental = async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id);
    if (!rental) return res.status(404).json({ message: 'Aluguel não encontrado' });
    if (req.user.storeId && rental.store_id !== req.user.storeId)
      return res.status(403).json({ message: 'Acesso negado.' });

    // Finalizados/cancelados nunca podem ser editados
    if (['returned', 'cancelled'].includes(rental.status)) {
      return res
        .status(400)
        .json({ message: 'Não é possível editar um aluguel finalizado ou cancelado.' });
    }

    // Retirados/atrasados: apenas campos financeiros (multa, desconto, observações).
    // Itens, datas e status ficam travados para não afetar o estoque.
    if (['picked_up', 'late'].includes(rental.status)) {
      const hasLockedChanges =
        req.body.products ||
        req.body.start_date ||
        req.body.end_date_scheduled ||
        'fitting_date' in req.body ||
        (req.body.status && req.body.status !== rental.status);
      if (hasLockedChanges) {
        return res.status(400).json({
          message:
            'Em um aluguel retirado ou atrasado só é possível alterar multa, desconto e observações.',
        });
      }
    }

    // Data da prova (opcional): valida contra a data de retirada vigente e a
    // data de criação do aluguel. null limpa a data, undefined mantém a atual.
    if ('fitting_date' in req.body && req.body.fitting_date) {
      const effectiveStartDate = req.body.start_date || rental.start_date;
      const fittingError = validateFittingDate(
        req.body.fitting_date,
        effectiveStartDate,
        rental.created_at,
      );
      if (fittingError) return res.status(400).json({ message: fittingError });
    }

    let itemsToSave = null;
    if (req.body.products) {
      itemsToSave = [];
      for (const item of req.body.products) {
        const productDb = await Product.findById(item.id);
        if (!productDb)
          return res.status(404).json({ message: `Produto ID ${item.id} não encontrado.` });
        itemsToSave.push({
          product_id: productDb.id,
          unit_price: productDb.rental_price, // Busca preço oficial do banco
          quantity: item.quantity || 1,
        });
      }
    }

    await Rental.updateRental(req.params.id, { ...req.body, items: itemsToSave });
    res.status(200).json({ status: 'success', message: 'Aluguel atualizado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao atualizar aluguel.' });
  }
};

exports.pickUpRental = async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id);
    if (!rental) return res.status(404).json({ message: 'Aluguel não encontrado' });
    if (req.user.storeId && rental.store_id !== req.user.storeId)
      return res.status(403).json({ message: 'Acesso negado.' });

    if (rental.status !== 'reserved' && rental.status !== 'budget') {
      return res.status(400).json({ message: 'Status do aluguel não permite retirada.' });
    }

    await Rental.pickUp(req.params.id);
    res.status(200).json({ status: 'success', message: 'Retirada confirmada. Traje em uso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao confirmar retirada.' });
  }
};

exports.extendRental = async (req, res) => {
  try {
    const rental = await Rental.findById(req.params.id);
    if (!rental) return res.status(404).json({ message: 'Aluguel não encontrado' });
    if (req.user.storeId && rental.store_id !== req.user.storeId)
      return res.status(403).json({ message: 'Acesso negado.' });

    if (rental.status !== 'picked_up' && rental.status !== 'late') {
      return res
        .status(400)
        .json({ message: 'Só é possível prorrogar alugueis que já foram retirados.' });
    }

    const { new_end_date, extra_amount } = req.body;
    if (!new_end_date)
      return res.status(400).json({ message: 'Nova data de devolução é obrigatória.' });

    await Rental.extendRental(req.params.id, new_end_date, extra_amount || 0);
    res.status(200).json({ status: 'success', message: 'Aluguel prorrogado com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao prorrogar aluguel.' });
  }
};

exports.returnRental = async (req, res) => {
  try {
    const { id } = req.params;
    const rental = await Rental.findById(id);
    if (!rental) return res.status(404).json({ message: 'Aluguel não encontrado' });
    if (req.user.storeId && rental.store_id !== req.user.storeId)
      return res.status(403).json({ message: 'Acesso negado.' });
    if (rental.status === 'returned' || rental.status === 'cancelled') {
      return res.status(400).json({ message: 'Aluguel já foi finalizado ou cancelado.' });
    }

    // Lê a multa do corpo da requisição (opcional)
    const penaltyFee = parseFloat(req.body.penalty_fee) || 0;
    // Opção de tornar produtos disponíveis imediatamente
    const makeAvailable = req.body.makeAvailable === true;

    const result = await Rental.returnRental(id, penaltyFee, makeAvailable);
    const message = makeAvailable
      ? 'Devolução registrada. Produtos disponíveis para novo aluguel.'
      : 'Devolução registrada. Produtos enviados para lavanderia.';
    res.status(200).json({
      status: 'success',
      message,
      penaltyFee: result.penaltyFee,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao processar devolução.' });
  }
};

exports.cancelRental = async (req, res) => {
  try {
    const { id } = req.params;
    const rental = await Rental.findById(id);

    if (!rental) return res.status(404).json({ message: 'Aluguel não encontrado' });

    if (req.user.storeId && rental.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    // Bloqueia: picked_up, late, returned (já foi retirado = não cancela, devolve)
    const blockedStatuses = ['picked_up', 'late', 'returned'];
    if (blockedStatuses.includes(rental.status)) {
      return res.status(400).json({
        message: `Não é possível cancelar aluguel com status "${rental.status}". Use devolução.`,
      });
    }

    await Rental.cancelRental(id);

    res.status(200).json({ status: 'success', message: 'Aluguel cancelado e produtos liberados.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao cancelar aluguel.' });
  }
};

exports.deleteRental = async (req, res) => {
  try {
    const { id } = req.params;
    const rental = await Rental.findById(id);

    if (!rental) return res.status(404).json({ message: 'Aluguel não encontrado' });

    if (req.user.storeId && rental.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    // Apenas status 'cancelled' pode ser excluído permanentemente
    if (rental.status !== 'cancelled') {
      return res.status(400).json({
        message:
          'Apenas itens cancelados podem ser excluídos permanentemente. Cancele o aluguel primeiro.',
      });
    }

    await Rental.deleteRental(id);

    res.status(200).json({ status: 'success', message: 'Aluguel excluído permanentemente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Erro ao excluir aluguel.' });
  }
};
