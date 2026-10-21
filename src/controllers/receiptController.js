const PaymentModel = require('../models/PaymentModel');
const ReceiptModel = require('../models/ReceiptModel');
const receiptService = require('../services/receiptService');

/**
 * POST /api/payments/:id/receipt
 * Issues a signed receipt PDF for a confirmed payment. By default it is
 * delivered via WhatsApp; with { sendWhatsApp: false } the WhatsApp step is
 * skipped and the signed PDF is returned for printing.
 */
exports.issueReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const sendWhatsApp = req.body?.sendWhatsApp !== false;

    const payment = await PaymentModel.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Pagamento não encontrado.' });
    }

    if (payment.status !== 'confirmed') {
      return res
        .status(422)
        .json({ message: 'Não é possível emitir recibo de um pagamento cancelado.' });
    }

    const { receiptId, deliveryStatus, pdfBuffer } = await receiptService.issueReceipt(
      id,
      req.user.id,
      { sendWhatsApp },
    );

    if (!sendWhatsApp) {
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="recibo_${receiptId}.pdf"`,
        'X-Receipt-Id': receiptId,
      });
      return res.status(201).send(pdfBuffer);
    }

    res.status(201).json({
      status: 'success',
      message: 'Recibo emitido com sucesso.',
      data: { receiptId, whatsappDeliveryStatus: deliveryStatus },
    });
  } catch (error) {
    console.error('Error issuing receipt:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao emitir recibo.' });
  }
};

/**
 * GET /api/payments/:id/receipts
 * Lists all receipts issued for a payment.
 */
exports.getReceiptsByPayment = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await PaymentModel.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Pagamento não encontrado.' });
    }

    const receipts = await ReceiptModel.findByPaymentId(id);
    res.status(200).json({ status: 'success', data: receipts });
  } catch (error) {
    console.error('Error listing receipts:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao listar recibos.' });
  }
};
