const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const PaymentModel = require('../models/PaymentModel');
const RentalModel = require('../models/RentalModel');
const CustomerModel = require('../models/CustomerModel');
const StoreModel = require('../models/StoreModel');
const UserModel = require('../models/UserModel');
const ReceiptModel = require('../models/ReceiptModel');
const whatsappService = require('./whatsappService');
const signer = require('./signing');

const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência Bancária',
};

const PAYMENT_TYPE_LABELS = {
  entry: 'Entrada (Reserva)',
  installment: 'Parcela',
  spontaneous: 'Pagamento Avulso',
  pickup_balance: 'Quitação na Retirada',
};

const formatCurrency = (value) =>
  `R$ ${parseFloat(value)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('pt-BR') : '-');

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('pt-BR') : '-');

// Pick the store's main phone-like contact (primary first)
const getStorePhone = (store) => {
  const contact = (store?.contacts || [])
    .filter((c) => ['whatsapp', 'mobile', 'landline'].includes(c.type))
    .sort((a, b) => (b.is_primary || 0) - (a.is_primary || 0))[0];
  return contact?.value || null;
};

/**
 * Renders the receipt PDF with PT-BR labels.
 */
function generateReceiptPdf(outputPath, data) {
  const { payment, rental, customer, store, issuedBy, issuedAt, installment } = data;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.fontSize(18).text('RECIBO DE PAGAMENTO', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Emitido em: ${formatDateTime(issuedAt)}`, { align: 'center' });
    doc.moveDown(1.5);

    // Store / company info
    doc.fontSize(12).text('Loja', { underline: true });
    doc.fontSize(10);
    doc.text(`Nome: ${store?.name || rental.store_name || '-'}`);
    if (store?.address) doc.text(`Endereço: ${store.address}`);
    const storePhone = getStorePhone(store);
    if (storePhone) doc.text(`Telefone: ${storePhone}`);
    doc.moveDown();

    // Customer info
    doc.fontSize(12).text('Cliente', { underline: true });
    doc.fontSize(10);
    doc.text(`Nome: ${customer?.name || rental.customer_name || '-'}`);
    if (customer?.cpf) doc.text(`CPF: ${customer.cpf}`);
    doc.moveDown();

    // Rental items
    doc.fontSize(12).text('Itens do Aluguel', { underline: true });
    doc.fontSize(10);
    doc.text(`Aluguel: #${rental.id}`);
    doc.text(
      `Período: ${formatDate(rental.start_date)} a ${formatDate(rental.end_date_scheduled)}`,
    );
    for (const item of rental.items || []) {
      doc.text(
        `- ${item.product_name || item.product_id} (x${item.quantity}) — ${formatCurrency(item.unit_price)}`,
      );
    }
    doc.moveDown();

    // Installment info (when the payment is linked to one)
    if (installment) {
      doc.fontSize(12).text('Parcela', { underline: true });
      doc.fontSize(10);
      doc.text(`Parcela: ${installment.number} de ${installment.total_installments}`);
      doc.text(`Vencimento: ${formatDate(installment.due_date)}`);
      doc.text(`Valor da Parcela: ${formatCurrency(installment.value)}`);
      doc.text(`Valor Pago da Parcela: ${formatCurrency(installment.amount_paid)}`);
      doc.moveDown();
    }

    // Payment info
    doc.fontSize(12).text('Pagamento', { underline: true });
    doc.fontSize(10);
    doc.text(`Valor Pago: ${formatCurrency(payment.amount)}`);
    doc.text(
      `Forma de Pagamento: ${PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}`,
    );
    doc.text(`Tipo: ${PAYMENT_TYPE_LABELS[payment.type] || payment.type}`);
    doc.text(`Data do Pagamento: ${formatDateTime(payment.paid_at)}`);
    if (payment.notes) doc.text(`Observações: ${payment.notes}`);
    doc.moveDown();

    doc.fontSize(10).text(`Emitido por: ${issuedBy?.name || payment.user_name || '-'}`);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error removing temp file %s:', filePath, error.message);
    }
  }
}

/**
 * Issues a signed receipt PDF for a confirmed payment, registers it in the
 * receipts table and tries to deliver it to the customer via WhatsApp.
 * When sendWhatsApp is false, the delivery is skipped and the signed PDF
 * buffer is returned so the caller can offer it for printing.
 *
 * @returns {{ receiptId: string, deliveryStatus: 'sent' | 'failed' | 'pending', pdfBuffer?: Buffer }}
 */
exports.issueReceipt = async (paymentId, userId, { sendWhatsApp = true } = {}) => {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) {
    throw new Error('PAYMENT_NOT_FOUND');
  }

  const rental = await RentalModel.findById(payment.rental_id);
  const customer = await CustomerModel.findById(rental.customer_id);
  const store = await StoreModel.findById(rental.store_id);
  const issuedBy = await UserModel.findById(userId);
  const installment = payment.installment_id
    ? await PaymentModel.findInstallmentById(payment.installment_id)
    : null;

  const issuedAt = new Date();
  const unsignedPath = path.join(os.tmpdir(), `recibo_${paymentId}.pdf`);
  const signedPath = path.join(os.tmpdir(), `recibo_${paymentId}_signed.pdf`);

  await generateReceiptPdf(unsignedPath, {
    payment,
    rental,
    customer,
    store,
    issuedBy,
    issuedAt,
    installment,
  });

  await signer.sign(unsignedPath, signedPath, {
    paymentId,
    customerId: rental.customer_id,
    issuedBy: userId,
    issuedAt,
  });

  const receipt = await ReceiptModel.create({
    paymentId,
    customerId: rental.customer_id,
    amount: payment.amount,
    paymentMethod: payment.payment_method,
    issuedAt,
    createdBy: userId,
  });

  let deliveryStatus = 'failed';
  let pdfBuffer;
  try {
    if (!sendWhatsApp) {
      // Print flow: no WhatsApp delivery; the receipt keeps the default
      // 'pending' status and the signed PDF goes back to the caller
      pdfBuffer = await fs.promises.readFile(signedPath);
    } else {
      // Prefer whatsapp/mobile contacts, primary first
      const phoneContact = (customer?.contacts || [])
        .filter((c) => ['whatsapp', 'mobile'].includes(c.type))
        .sort((a, b) => (b.is_primary || 0) - (a.is_primary || 0))[0];

      if (!phoneContact) {
        console.error('Receipt %s: customer has no WhatsApp/mobile contact.', receipt.id);
      } else {
        const sent = await whatsappService.sendDocument({
          to: phoneContact.value,
          filePath: signedPath,
          fileName: `recibo_${paymentId}.pdf`,
          caption: `Recibo de pagamento - ${formatCurrency(payment.amount)} - ${store?.name || 'Madri Noivas'}`,
        });
        deliveryStatus = sent ? 'sent' : 'failed';
      }
      await ReceiptModel.updateDeliveryStatus(receipt.id, deliveryStatus);
    }
  } catch (error) {
    console.error('Error delivering receipt %s via WhatsApp:', receipt.id, error);
    await ReceiptModel.updateDeliveryStatus(receipt.id, 'failed');
  } finally {
    await safeUnlink(unsignedPath);
    await safeUnlink(signedPath);
  }

  return {
    receiptId: receipt.id,
    deliveryStatus: sendWhatsApp ? deliveryStatus : 'pending',
    pdfBuffer,
  };
};
