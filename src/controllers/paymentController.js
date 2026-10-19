const Payment = require('../models/PaymentModel');
const Rental = require('../models/RentalModel'); // Used to validate that the rental exists

const PAYMENT_TYPES = ['entry', 'installment', 'spontaneous', 'pickup_balance'];
const PAYMENT_METHODS = ['cash', 'credit_card', 'debit_card', 'pix', 'bank_transfer'];

exports.createPayment = async (req, res) => {
  try {
    const { rental_id, installment_id, amount, payment_method, type, notes } = req.body;

    // Required fields
    if (!rental_id || !amount || !payment_method) {
      return res.status(400).json({ message: 'Dados incompletos para pagamento.' });
    }

    const numericAmount = parseFloat(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'O valor do pagamento deve ser maior que zero.' });
    }

    if (!PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ message: 'Forma de pagamento inválida.' });
    }

    if (type && !PAYMENT_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Tipo de pagamento inválido.' });
    }

    // Check if rental exists (and belongs to the user's store)
    const rental = await Rental.findById(rental_id);
    if (!rental) {
      return res.status(404).json({ message: 'Aluguel não encontrado.' });
    }

    if (req.user.storeId && rental.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Não é possível receber pagamentos de outra loja.' });
    }

    // Business rule: amount cannot exceed the rental's remaining balance
    const totalPaid = await Payment.getTotalPaidByRentalId(rental_id);
    const remainingBalance = parseFloat(rental.total_amount) - totalPaid;
    if (numericAmount > remainingBalance + 0.01) {
      return res.status(400).json({
        message: `O valor informado excede o saldo devedor do aluguel (R$ ${remainingBalance.toFixed(2)}).`,
      });
    }

    // If linked to an installment, it must belong to this rental and still be open
    if (installment_id) {
      const installment = await Payment.findInstallmentById(installment_id);
      if (!installment || installment.rental_id !== rental_id) {
        return res.status(400).json({ message: 'Parcela não encontrada para este aluguel.' });
      }
      if (['paid', 'cancelled'].includes(installment.status)) {
        return res.status(400).json({ message: 'Esta parcela já está quitada ou cancelada.' });
      }
    }

    const payment = await Payment.create({
      rental_id,
      installment_id: installment_id || null,
      user_id: req.user.id,
      amount: numericAmount,
      payment_method,
      // Default: linked installment implies an installment payment, otherwise spontaneous
      type: type || (installment_id ? 'installment' : 'spontaneous'),
      notes: notes || null,
    });

    res.status(201).json({ status: 'success', data: payment });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao processar pagamento.' });
  }
};

exports.getPaymentsByRental = async (req, res) => {
  try {
    const { rentalId } = req.params;
    const payments = await Payment.findByRentalId(rentalId);
    res.status(200).json({ status: 'success', data: payments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro interno.' });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_method, type, installment_id, notes } = req.body;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Pagamento não encontrado.' });
    }

    if (payment.status === 'cancelled') {
      return res.status(400).json({ message: 'Não é possível editar um pagamento cancelado.' });
    }

    // Store check: same pattern as createPayment
    const rental = await Rental.findById(payment.rental_id);
    if (req.user.storeId && rental && rental.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Não é possível editar pagamentos de outra loja.' });
    }

    // Validate only the provided fields
    let numericAmount;
    if (amount !== undefined) {
      numericAmount = parseFloat(amount);
      if (Number.isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ message: 'O valor do pagamento deve ser maior que zero.' });
      }
    }

    if (payment_method !== undefined && !PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ message: 'Forma de pagamento inválida.' });
    }

    if (type !== undefined && !PAYMENT_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Tipo de pagamento inválido.' });
    }

    // Business rule: new amount cannot exceed the rental's remaining balance,
    // excluding the payment being edited from the total already paid
    if (numericAmount !== undefined) {
      const totalPaid = await Payment.getTotalPaidByRentalId(payment.rental_id);
      const remainingBalance =
        parseFloat(rental.total_amount) - (totalPaid - parseFloat(payment.amount));
      if (numericAmount > remainingBalance + 0.01) {
        return res.status(400).json({
          message: `O valor informado excede o saldo devedor do aluguel (R$ ${remainingBalance.toFixed(2)}).`,
        });
      }
    }

    // If linked to an installment, it must belong to this rental and still be open.
    // A paid installment is acceptable only if it is the payment's current link:
    // the revert runs before the apply, which reopens it.
    if (installment_id) {
      const installment = await Payment.findInstallmentById(installment_id);
      if (!installment || installment.rental_id !== payment.rental_id) {
        return res.status(400).json({ message: 'Parcela não encontrada para este aluguel.' });
      }
      if (installment.status === 'cancelled') {
        return res.status(400).json({ message: 'Esta parcela está cancelada.' });
      }
      if (installment.status === 'paid' && installment.id !== payment.installment_id) {
        return res.status(400).json({ message: 'Esta parcela já está quitada.' });
      }
    }

    const data = {};
    if (numericAmount !== undefined) data.amount = numericAmount;
    if (payment_method !== undefined) data.payment_method = payment_method;
    if (type !== undefined) data.type = type;
    if (installment_id !== undefined) data.installment_id = installment_id;
    if (notes !== undefined) data.notes = notes;

    const updated = await Payment.update(id, data, payment);

    res.status(200).json({ status: 'success', data: updated });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao atualizar pagamento.' });
  }
};

exports.cancelPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'Informe o motivo do cancelamento.' });
    }

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Pagamento não encontrado.' });
    }

    // Store check: same pattern as createPayment
    const rental = await Rental.findById(payment.rental_id);
    if (req.user.storeId && rental && rental.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Não é possível cancelar pagamentos de outra loja.' });
    }

    if (payment.status === 'cancelled') {
      return res.status(400).json({ message: 'Este pagamento já está cancelado.' });
    }

    await Payment.cancel(id, req.user.id, String(reason).trim());

    res.status(200).json({ status: 'success', message: 'Pagamento cancelado com sucesso.' });
  } catch (error) {
    if (error.message === 'PAYMENT_ALREADY_CANCELLED') {
      return res.status(400).json({ message: 'Este pagamento já está cancelado.' });
    }
    console.error('Error cancelling payment:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao cancelar pagamento.' });
  }
};
