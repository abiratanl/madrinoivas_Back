const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const RentalModel = require('../models/RentalModel');
const CustomerModel = require('../models/CustomerModel');
const StoreModel = require('../models/StoreModel');
const UserModel = require('../models/UserModel');
const PaymentModel = require('../models/PaymentModel');
const ContractModel = require('../models/ContractModel');
const whatsappService = require('./whatsappService');
const emailService = require('./emailService');
const signer = require('./signing');

const SIGNATURE_DATA_URL_REGEX = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/;

const formatCurrency = (value) =>
  `R$ ${parseFloat(value || 0)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('pt-BR') : '-');

const formatDateLong = (value) =>
  value
    ? new Date(value).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '-';

/**
 * Extracts the raw image buffer from a signature data URL.
 * Returns null when the value is not a valid PNG/JPEG data URL.
 */
function signatureToBuffer(dataUrl) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(SIGNATURE_DATA_URL_REGEX) : null;
  if (!match) return null;
  try {
    return Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  } catch {
    return null;
  }
}

/**
 * Renders the rental contract PDF with PT-BR clauses, mirroring the
 * frontend ContractPreview, and embeds the lessee signature image.
 */
function generateContractPdf(outputPath, data) {
  const { contract, rental, customer, store, totalPaid, issuedBy, issuedAt } = data;

  const totalAmount = parseFloat(rental.total_amount || 0);
  const balanceDue = Math.max(totalAmount - parseFloat(totalPaid || 0), 0);
  const rentalDays = Math.max(
    1,
    Math.ceil(
      (new Date(rental.end_date_scheduled) - new Date(rental.start_date)) / (1000 * 60 * 60 * 24),
    ),
  );
  const extraDailyRate = totalAmount / rentalDays;
  const primaryAddress = (store?.addresses || [])[0] || null;
  const storeCity = primaryAddress?.city || '';
  const storeState = primaryAddress?.state || '';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Store header
    doc.fontSize(16).text((store?.name || rental.store_name || 'Madri Noivas').toUpperCase(), {
      align: 'center',
    });
    doc.fontSize(9);
    if (store?.address) doc.text(store.address, { align: 'center' });
    if (store?.phone) doc.text(`Telefone: ${store.phone}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc
      .fontSize(13)
      .text('CONTRATO DE LOCAÇÃO DE VESTUÁRIO E ACESSÓRIOS', { align: 'center', underline: true });
    doc
      .fontSize(9)
      .text(`Contrato Nº: ${contract.id.slice(0, 8).toUpperCase()}`, { align: 'center' });
    doc.moveDown(1);

    // Clause 1 - Object
    doc.fontSize(11).text('Cláusula 1ª – Do Objeto');
    doc
      .fontSize(9)
      .text(
        'O presente contrato tem como objeto a locação da(s) seguinte(s) peça(s) de vestuário/acessório(s):',
      );
    for (const item of rental.items || []) {
      const description = [
        item.product_name || item.product_id,
        item.color ? `cor ${item.color}` : null,
        item.size ? `tamanho ${item.size}` : null,
        item.brand ? `marca ${item.brand}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      doc.text(
        `• ${description} (x${item.quantity || 1}) — Valor: ${formatCurrency(item.unit_price)}`,
        { indent: 10 },
      );
    }
    doc.moveDown(0.8);

    // Clause 2 - Term
    doc.fontSize(11).text('Cláusula 2ª – Do Prazo da Locação');
    doc.fontSize(9);
    doc.text(`• Data de Retirada/Entrega: ${formatDate(rental.start_date)}`, { indent: 10 });
    doc.text(`• Data de Devolução: ${formatDate(rental.end_date_scheduled)}`, { indent: 10 });
    doc.text(
      '• O prazo de locação é certo e determinado, encerrando-se obrigatoriamente na data de devolução estipulada acima.',
      { indent: 10 },
    );
    doc.moveDown(0.8);

    // Clause 3 - Price and payment
    doc.fontSize(11).text('Cláusula 3ª – Do Valor e Forma de Pagamento');
    doc.fontSize(9);
    doc.text(`• Valor Total do Aluguel: ${formatCurrency(totalAmount)}`, { indent: 10 });
    doc.text(`• Valor Já Pago (reserva/amortizações): ${formatCurrency(totalPaid)}`, {
      indent: 10,
    });
    doc.text(
      `• Saldo Restante: ${formatCurrency(balanceDue)} — deverá ser quitado no ato da retirada da peça.`,
      { indent: 10 },
    );
    doc.moveDown(0.8);

    // Clause 4 - Lessee obligations
    doc.fontSize(11).text('Cláusula 4ª – Das Obrigações da Locatária(O)');
    doc.fontSize(9);
    doc.text(
      '1. Utilizar a peça com cautela, evitando danos, manchas severas, rasgos ou alterações (como barras ou ajustes não autorizados).',
      { indent: 10 },
    );
    doc.text(
      '2. Não lavar ou passar a peça, devendo devolvê-la nas mesmas condições em que foi recebida.',
      { indent: 10 },
    );
    doc.text('3. Devolver o produto no prazo estabelecido na Cláusula 2ª.', { indent: 10 });
    doc.moveDown(0.8);

    // Clause 5 - Delays, damage and loss
    doc.fontSize(11).text('Cláusula 5ª – Atrasos, Danos e Extravio');
    doc.fontSize(9);
    doc.text(
      `• Atraso na Devolução: será cobrada uma taxa de diária adicional no valor de ${formatCurrency(extraDailyRate)} por dia de atraso.`,
      { indent: 10 },
    );
    doc.text(
      '• Danos à Peça: havendo danos reparáveis (manchas profundas ou rasgos), a Locatária(O) arcará com o custo do conserto/lavagem especializada. Caso o dano seja irreparável ou ocorra extravio/roubo, será cobrado o valor integral de venda da peça descrito pela Locadora.',
      { indent: 10 },
    );
    doc.moveDown(0.8);

    // Clause 6 - Jurisdiction
    doc.fontSize(11).text('Cláusula 6ª – Do Foro');
    doc
      .fontSize(9)
      .text(
        `Fica eleito o foro da Comarca de ${storeCity || '________'} - ${storeState || '__'} para dirimir quaisquer dúvidas decorrentes deste contrato.`,
      );
    doc.moveDown(2);

    // Signatures
    const signatureTop = doc.y;
    const leftX = 80;
    const rightX = 330;
    const lineWidth = 190;

    doc
      .moveTo(leftX, signatureTop + 60)
      .lineTo(leftX + lineWidth, signatureTop + 60)
      .stroke();
    doc
      .fontSize(9)
      .text('LOCADORA', leftX, signatureTop + 65, { width: lineWidth, align: 'center' });
    doc.text(store?.name || rental.store_name || '', leftX, signatureTop + 78, {
      width: lineWidth,
      align: 'center',
    });

    const signatureBuffer = signatureToBuffer(contract.lessee_signature);
    if (signatureBuffer) {
      doc.image(signatureBuffer, rightX + 35, signatureTop - 10, { width: 120 });
    }
    doc
      .moveTo(rightX, signatureTop + 60)
      .lineTo(rightX + lineWidth, signatureTop + 60)
      .stroke();
    doc.text('LOCATÁRIA(O)', rightX, signatureTop + 65, { width: lineWidth, align: 'center' });
    doc.text(customer?.name || rental.customer_name || '', rightX, signatureTop + 78, {
      width: lineWidth,
      align: 'center',
    });
    if (customer?.cpf) {
      doc.text(`CPF: ${customer.cpf}`, rightX, signatureTop + 90, {
        width: lineWidth,
        align: 'center',
      });
    }

    doc.y = signatureTop + 110;
    doc.moveDown(1);
    doc.text(`${storeCity || '________'} - ${storeState || '__'}, ${formatDateLong(issuedAt)}.`, {
      align: 'center',
    });
    doc.moveDown(0.5);
    doc.text(`Emitido por: ${issuedBy?.name || '-'}`, { align: 'center' });

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
 * Loads every entity needed to render the contract PDF.
 */
async function loadContractData(contract, userId) {
  const rental = await RentalModel.findById(contract.rental_id);
  if (!rental) {
    throw new Error('RENTAL_NOT_FOUND');
  }
  const customer = await CustomerModel.findById(contract.customer_id);
  const store = await StoreModel.findById(rental.store_id);
  const issuedBy = userId ? await UserModel.findById(userId) : null;
  const totalPaid = await PaymentModel.getTotalPaidByRentalId(rental.id);

  return { rental, customer, store, issuedBy, totalPaid };
}

/**
 * Renders and signs the contract PDF into temp files, returning the signed
 * path plus a cleanup callback.
 */
async function renderSignedPdf(contract, data) {
  const unsignedPath = path.join(os.tmpdir(), `contrato_${contract.id}.pdf`);
  const signedPath = path.join(os.tmpdir(), `contrato_${contract.id}_signed.pdf`);

  await generateContractPdf(unsignedPath, { contract, ...data });
  await signer.sign(unsignedPath, signedPath, {
    contractId: contract.id,
    rentalId: contract.rental_id,
    customerId: contract.customer_id,
    issuedAt: contract.issued_at,
  });

  return { unsignedPath, signedPath };
}

/**
 * Generates a signed rental contract PDF from the lessee digital signature
 * (PNG/JPEG data URL captured by the signature pad) and registers it.
 *
 * @returns {{ contractId: string }}
 */
exports.issueContract = async (rentalId, userId, lesseeSignature) => {
  if (!signatureToBuffer(lesseeSignature)) {
    throw new Error('INVALID_SIGNATURE');
  }

  const rental = await RentalModel.findById(rentalId);
  if (!rental) {
    throw new Error('RENTAL_NOT_FOUND');
  }
  if (rental.status === 'cancelled') {
    throw new Error('RENTAL_CANCELLED');
  }

  const issuedAt = new Date();
  const contract = await ContractModel.create({
    rentalId,
    customerId: rental.customer_id,
    lesseeSignature,
    issuedAt,
    createdBy: userId,
  });

  const data = await loadContractData(contract, userId);
  const { unsignedPath, signedPath } = await renderSignedPdf(
    { ...contract, issued_at: issuedAt },
    data,
  );
  await safeUnlink(unsignedPath);
  await safeUnlink(signedPath);

  return { contractId: contract.id };
};

/**
 * Re-renders the signed contract PDF on demand and returns it as a Buffer.
 */
exports.getContractPdfBuffer = async (contractId) => {
  const contract = await ContractModel.findById(contractId);
  if (!contract) {
    throw new Error('CONTRACT_NOT_FOUND');
  }

  const data = await loadContractData(contract, contract.created_by);
  const { unsignedPath, signedPath } = await renderSignedPdf(contract, data);

  try {
    return await fs.promises.readFile(signedPath);
  } finally {
    await safeUnlink(unsignedPath);
    await safeUnlink(signedPath);
  }
};

/**
 * Sends the signed contract PDF by e-mail. Delivery failures update the
 * contract status but never throw.
 *
 * @returns {{ deliveryStatus: 'sent' | 'failed' }}
 */
exports.sendContractEmail = async (contractId, email, userId) => {
  const contract = await ContractModel.findById(contractId);
  if (!contract) {
    throw new Error('CONTRACT_NOT_FOUND');
  }

  const data = await loadContractData(contract, userId || contract.created_by);
  const { unsignedPath, signedPath } = await renderSignedPdf(contract, data);

  let deliveryStatus = 'failed';
  try {
    const sent = await emailService.sendEmail({
      to: email,
      subject: `Contrato de Locação - ${data.store?.name || 'Madri Noivas'}`,
      text: `Olá, ${data.customer?.name || 'cliente'}! Segue em anexo o seu contrato de locação (Contrato Nº ${contract.id
        .slice(0, 8)
        .toUpperCase()}).`,
      attachments: [
        {
          filename: `contrato_${contract.id.slice(0, 8)}.pdf`,
          path: signedPath,
        },
      ],
    });
    deliveryStatus = sent ? 'sent' : 'failed';
  } catch (error) {
    console.error('Error sending contract %s via email:', contractId, error);
  } finally {
    await ContractModel.updateDeliveryStatus(contractId, 'email', deliveryStatus);
    await safeUnlink(unsignedPath);
    await safeUnlink(signedPath);
  }

  return { deliveryStatus };
};

/**
 * Sends the signed contract PDF via WhatsApp. Delivery failures update the
 * contract status but never throw.
 *
 * @returns {{ deliveryStatus: 'sent' | 'failed' }}
 */
exports.sendContractWhatsApp = async (contractId, phone, userId) => {
  const contract = await ContractModel.findById(contractId);
  if (!contract) {
    throw new Error('CONTRACT_NOT_FOUND');
  }

  const data = await loadContractData(contract, userId || contract.created_by);
  const { unsignedPath, signedPath } = await renderSignedPdf(contract, data);

  let deliveryStatus = 'failed';
  try {
    const sent = await whatsappService.sendDocument({
      to: phone,
      filePath: signedPath,
      fileName: `contrato_${contract.id.slice(0, 8)}.pdf`,
      caption: `Contrato de locação - ${data.store?.name || 'Madri Noivas'}`,
    });
    deliveryStatus = sent ? 'sent' : 'failed';
  } catch (error) {
    console.error('Error sending contract %s via WhatsApp:', contractId, error);
  } finally {
    await ContractModel.updateDeliveryStatus(contractId, 'whatsapp', deliveryStatus);
    await safeUnlink(unsignedPath);
    await safeUnlink(signedPath);
  }

  return { deliveryStatus };
};
