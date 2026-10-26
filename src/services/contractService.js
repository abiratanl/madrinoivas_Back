const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const { PDFDocument: PdfLibDocument } = require('pdf-lib');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const RentalModel = require('../models/RentalModel');
const CustomerModel = require('../models/CustomerModel');
const StoreModel = require('../models/StoreModel');
const UserModel = require('../models/UserModel');
const PaymentModel = require('../models/PaymentModel');
const ContractModel = require('../models/ContractModel');
const whatsappService = require('./whatsappService');
const emailService = require('./emailService');
const { uploadBuffer, downloadFile, extractKey, getPublicUrl } = require('./uploadService');
const signer = require('./signing');

const SIGNATURE_DATA_URL_REGEX = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/;
const SIGNATURE_BLOCK_BOTTOM_OFFSET = 190;
const SIGNATURE_LINE_OFFSET = 60;
const SIGNATURE_BLOCK_GAP = 30;
const SIGNATURE_BLOCK_HEIGHT = 115;
const SIGNATURE_LINE_METADATA_REGEX = /madri-signature-line-y=([\d.]+)/;
const SIGNATURE_IMAGE_X = 355;
const SIGNATURE_IMAGE_WIDTH = 120;
const CONTRACTS_R2_FOLDER = 'contracts';
const DEFAULT_CONTRACT_PREFIX = 'MADRI';
const CONTRACT_NUMBER_MAX_ATTEMPTS = 3;
const TRANSIENT_DB_ERRORS = new Set(['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const buildContractPdfKey = (rentalId, contractId, fileName) =>
  `${CONTRACTS_R2_FOLDER}/${rentalId}/${contractId}/${fileName}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeContractPrefix = (value) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized || DEFAULT_CONTRACT_PREFIX;
};

const resolveContractPrefix = (store) =>
  normalizeContractPrefix(
    store?.contract_number_prefix ||
      store?.contract_prefix ||
      process.env.CONTRACT_NUMBER_PREFIX ||
      DEFAULT_CONTRACT_PREFIX,
  );

const getContractNumberLabel = (contract) =>
  contract.contract_number ||
  String(contract.id || '')
    .slice(0, 8)
    .toUpperCase();

const buildContractFileName = (contract) =>
  `contrato_${(contract.contract_number || String(contract.id || '').slice(0, 8)).replace(
    /[^A-Za-z0-9_-]/g,
    '-',
  )}.pdf`;

const formatCurrency = (value) =>
  `R$ ${parseFloat(value || 0)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

// Date-only values (rental start/end) must not be shifted by the UTC offset.
const parseDateValue = (value) => {
  if (typeof value === 'string') {
    const datePart = value.slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  return new Date(value);
};

const formatDateLong = (value) =>
  value
    ? parseDateValue(value).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '-';

const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência Bancária',
};

// Lessor (Madri Noivas) legal identification used as fallback when the store
// record does not carry the full legal data.
const LESSOR_LEGAL_NAME = 'TERESA FRANCA DE OLIVEIRA FRANCISCO (ME)';
const LESSOR_TRADE_NAME = 'MADRI NOIVAS TRAJES A RIGOR';
const LESSOR_CNPJ = '07.846.246/0001-28';
const LESSOR_ADDRESS = 'Rua Dr. Castro Santos, nº 98, Centro, Guaratinguetá - SP, CEP 12505-010';
const LESSOR_REPRESENTATIVE = 'Teresa França de Oliveira Francisco';
const CONTRACT_CITY = 'Guaratinguetá';
const CONTRACT_STATE = 'SP';

// Pick the customer's default address (first as fallback)
const getCustomerAddress = (customer) => {
  const addresses = customer?.addresses || [];
  return addresses.find((a) => a.is_default) || addresses[0] || null;
};

// Pick the customer's main phone-like contact (primary first)
const getCustomerPhone = (customer) => {
  const contact = (customer?.contacts || [])
    .filter((c) => ['whatsapp', 'mobile', 'landline'].includes(c.type))
    .sort((a, b) => (b.is_primary || 0) - (a.is_primary || 0))[0];
  return contact?.value || null;
};

// Pick the customer's main e-mail contact (primary first)
const getCustomerEmail = (customer) => {
  const contact = (customer?.contacts || [])
    .filter((c) => c.type === 'email')
    .sort((a, b) => (b.is_primary || 0) - (a.is_primary || 0))[0];
  return contact?.value || null;
};

// Human-readable description of every rented item, used in Clause One.
const getItemsDescription = (items = []) => {
  const descriptions = items.map((item) => {
    const details = [
      item.product_name || item.product_id,
      item.color ? `cor ${item.color}` : null,
      item.size ? `tamanho ${item.size}` : null,
      item.brand ? `marca ${item.brand}` : null,
    ].filter(Boolean);
    return `${details.join(', ')} (Qtd: ${item.quantity || 1})`;
  });
  return descriptions.length > 0 ? descriptions.join('; ') : '-';
};

// Down payment (sinal/entrada): the entry payment when present, otherwise the
// first confirmed payment registered for the rental.
const getDownPayment = (payments = []) => {
  const confirmed = payments
    .filter((payment) => payment.status !== 'cancelled')
    .slice()
    .sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime());
  return confirmed.find((payment) => payment.type === 'entry') || confirmed[0] || null;
};

const formatFittingDate = (value) =>
  value
    ? new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'A definir';

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
 * Overlays the lessee signature image onto the lessee signature area of the
 * draft PDF. The original draft bytes are used as the base document, so no
 * content is re-rendered and the signed file preserves the audited draft.
 */
async function embedLesseeSignature(draftBuffer, lesseeSignature, metadata = {}) {
  const match = lesseeSignature.match(SIGNATURE_DATA_URL_REGEX);
  const signatureBuffer = signatureToBuffer(lesseeSignature);
  if (!match || !signatureBuffer) {
    throw new Error('INVALID_SIGNATURE');
  }

  const pdfDoc = await PdfLibDocument.load(draftBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];

  const image =
    match[1] === 'png'
      ? await pdfDoc.embedPng(signatureBuffer)
      : await pdfDoc.embedJpg(signatureBuffer);

  let drawWidth = SIGNATURE_IMAGE_WIDTH;
  let drawHeight = (image.height / image.width) * drawWidth;
  const maxHeight = 45;
  if (drawHeight > maxHeight) {
    drawHeight = maxHeight;
    drawWidth = (image.width / image.height) * drawHeight;
  }

  // The draft stores the exact signature-line position in its metadata so the
  // overlay stays aligned even though the line now follows the document text
  // instead of a fixed bottom offset. Older drafts fall back to the constant.
  let signatureLineBottomY = SIGNATURE_BLOCK_BOTTOM_OFFSET - SIGNATURE_LINE_OFFSET;
  const metadataLine = SIGNATURE_LINE_METADATA_REGEX.exec(pdfDoc.getKeywords() || '');
  if (metadataLine) {
    signatureLineBottomY = Number.parseFloat(metadataLine[1]);
  }

  lastPage.drawImage(image, {
    x: SIGNATURE_IMAGE_X + (SIGNATURE_IMAGE_WIDTH - drawWidth) / 2,
    y: signatureLineBottomY + 3,
    width: drawWidth,
    height: drawHeight,
  });

  if (metadata.documentHash) {
    pdfDoc.setSubject(
      `Contrato assinado eletronicamente. Hash SHA-256 do original: ${metadata.documentHash}`,
    );
  }
  if (metadata.signedAt) {
    pdfDoc.setCreationDate(new Date(metadata.signedAt));
    pdfDoc.setModificationDate(new Date(metadata.signedAt));
  }

  return Buffer.from(await pdfDoc.save());
}

/**
 * Renders the rental contract PDF with PT-BR clauses, mirroring the
 * frontend ContractPreview, and embeds the lessee signature image.
 */
function generateContractPdf(outputPath, data) {
  const { contract, rental, customer, store, totalPaid, payments, issuedAt } = data;

  const totalAmount = parseFloat(rental.total_amount || rental.total_price || 0);
  const paidAmount = parseFloat(totalPaid || 0);
  const remainingBalance = Math.max(totalAmount - paidAmount, 0);
  const downPayment = getDownPayment(payments);
  const downPaymentAmount = downPayment ? parseFloat(downPayment.amount || 0) : 0;
  const downPaymentMethod = downPayment
    ? PAYMENT_METHOD_LABELS[downPayment.payment_method] || downPayment.payment_method
    : '-';

  const customerAddress = getCustomerAddress(customer) || {};
  const lesseeName = customer?.name || rental.customer_name || '-';
  const lesseeCpf = customer?.cpf || rental.customer_cpf || '-';
  const lesseeRg = customer?.rg || '-';
  const lesseePhone = getCustomerPhone(customer) || '-';
  const lesseeEmail = getCustomerEmail(customer) || '-';
  const itemsDescription = getItemsDescription(rental.items);
  const issuedDate = contract.issued_at || issuedAt;
  const primaryAddress = (store?.addresses || [])[0] || null;
  const lessorCnpj = store?.cnpj || LESSOR_CNPJ;
  const lessorAddress =
    store?.address ||
    (primaryAddress?.street
      ? `${primaryAddress.street}, nº ${primaryAddress.number} - ${primaryAddress.neighborhood}, ${primaryAddress.city} - ${primaryAddress.state}, CEP ${primaryAddress.zip_code}`
      : LESSOR_ADDRESS);
  const lessorRepresentative = store?.owner_name || LESSOR_REPRESENTATIVE;
  const storeCity = primaryAddress?.city || CONTRACT_CITY;
  const storeState = primaryAddress?.state || CONTRACT_STATE;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const heading = (text) => {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(10.5).text(text.toUpperCase());
      doc.moveDown(0.25);
    };

    const paragraph = (text, options = {}) => {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .text(text, { align: 'justify', lineGap: 1.5, ...options });
    };

    const bullet = (label, value) => {
      doc.font('Helvetica').fontSize(9.5);
      if (label) {
        doc.font('Helvetica-Bold').text(`• ${label}: `, { continued: true, indent: 12 });
        doc.font('Helvetica').text(String(value ?? '-'));
      } else {
        doc.text(`• ${value}`);
      }
    };

    doc
      .font('Helvetica-Bold')
      .fontSize(12.5)
      .text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS E LOCAÇÃO DE TRAJES A RIGOR', {
        align: 'center',
      });
    doc.moveDown(0.6);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .text(`CONTRATO Nº: ${getContractNumberLabel(contract)}`, {
        align: 'center',
      });
    doc.moveDown(1.4);

    paragraph('Pelo presente instrumento particular, de um lado:');

    heading('LOCADORA');
    bullet('Razão Social', LESSOR_LEGAL_NAME);
    bullet('Nome Fantasia', LESSOR_TRADE_NAME);
    bullet('CNPJ', lessorCnpj);
    bullet('Endereço', lessorAddress);
    bullet('Representante Legal', lessorRepresentative);

    paragraph('E, de outro lado:');

    heading('LOCATÁRIO(A)');
    bullet('Nome/Razão Social', lesseeName);
    bullet('CPF/CNPJ', lesseeCpf);
    bullet('RG', lesseeRg);
    bullet(
      'Endereço',
      `${customerAddress.street || '-'}, nº ${customerAddress.number || '-'} - ${
        customerAddress.neighborhood || '-'
      }`,
    );
    bullet(
      'Cidade/UF',
      `${customerAddress.city || '-'}/${customerAddress.state || '-'} - CEP: ${customerAddress.zip_code || '-'}`,
    );
    bullet('Telefone/WhatsApp', lesseePhone);
    bullet('E-mail', lesseeEmail);

    paragraph(
      'As partes acima qualificadas têm entre si, justo e contratado, o presente Contrato de Locação de Trajes a Rigor, mediante as cláusulas e condições a seguir descritas:',
    );

    heading('CLÁUSULA PRIMEIRA – DO OBJETO');
    paragraph(
      'O presente contrato tem por objeto a locação do(s) traje(s) e acessório(s) discriminado(s) abaixo, para uso exclusivo do(a) LOCATÁRIO(A) na data estipulada neste instrumento:',
    );
    bullet('Descrição dos Trajes / Itens', itemsDescription);

    heading('CLÁUSULA SEGUNDA – DO CRONOGRAMA DA LOCAÇÃO');
    paragraph('A locação obedecerá rigorosamente às seguintes datas e prazos agendados:');
    bullet('1. Data do Evento (Uso Reservado)', formatDateLong(rental.start_date));
    bullet('2. Data/Hora Agendada para a Prova', formatFittingDate(rental.fitting_date));
    bullet('3. Data Prevista para Devolução', formatDateLong(rental.end_date_scheduled));
    paragraph(
      'Parágrafo Único: O(A) LOCATÁRIO(A) compromete-se a comparecer na data agendada para a Prova, sob pena de inviabilizar os ajustes necessários no traje para a data do evento.',
    );

    heading('CLÁUSULA TERCEIRA – DO PREÇO E CONDICIONAMENTO FINANCEIRO');
    paragraph(
      'O valor total desta locação e o plano de pagamento pactuado estão definidos no seguinte resumo financeiro:',
    );
    bullet('Valor Total do Aluguel', formatCurrency(totalAmount));
    bullet(
      'Sinal / Entrada Recebido',
      `${formatCurrency(downPaymentAmount)} (Forma de Pagamento: ${downPaymentMethod})`,
    );
    bullet('Saldo Devedor Restante', formatCurrency(remainingBalance));
    paragraph(
      'Parágrafo Primeiro: O valor referente ao Sinal/Entrada tem caráter confirmatório da reserva. Em caso de desistência imotivada por parte do(a) LOCATÁRIO(A), o valor do sinal cobrirá os custos de reserva de agenda do traje e não será restituído.',
    );
    paragraph(
      'Parágrafo Segundo: O saldo devedor restante deverá ser integralmente quitado até a data de retirada do traje, sob pena de retenção do bem até a efetiva quitação.',
    );

    heading('CLÁUSULA QUARTA – DA CONSERVAÇÃO E DANOS');
    paragraph(
      'O(A) LOCATÁRIO(A) declara receber o(s) traje(s) em perfeitas condições de uso, higienizado(s) e sem defeitos aparentes, comprometendo-se a devolvê-lo(s) nas mesmas condições.',
    );
    paragraph(
      'Parágrafo Único: Danos irreparáveis, manchas definitivas (tintas, queimaduras de cigarro/vela), rasgos ou extravio total do traje obrigarão o(a) LOCATÁRIO(A) ao pagamento do valor comercial de venda do item, descontados os valores já pagos no aluguel.',
    );

    heading('CLÁUSULA QUINTA – ATRASO NA DEVOLUÇÃO');
    paragraph(
      `A não devolução do traje na data limite estabelecida na Cláusula Segunda (${formatDateLong(
        rental.end_date_scheduled,
      )}) sujeitará o(a) LOCATÁRIO(A) ao pagamento de multa diária correspondente a 10% (dez por cento) sobre o valor total do contrato por dia de atraso, sem prejuízo de perdas e danos caso o atraso comprometa a locação do mesmo traje para outro cliente.`,
    );

    heading('CLÁUSULA SEXTA – PROTEÇÃO E TRATAMENTO DE DADOS (LGPD)');
    paragraph(
      'Em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD):',
    );
    paragraph(
      '1. A LOCADORA coleta e armazena os dados pessoais do(a) LOCATÁRIO(A) (Nome, CPF, RG, Endereço, Telefone e E-mail) exclusivamente para fins de execução deste contrato, emissão de comprovantes financeiros, identificação do(a) LOCATÁRIO(A) e contato operacional referente à prova e devolução dos trajes.',
    );
    paragraph(
      '2. A LOCADORA compromete-se a adotar medidas de segurança administrativas e tecnológicas para proteger os dados pessoais do(a) LOCATÁRIO(A) contra acessos não autorizados ou vazamentos.',
    );
    paragraph(
      '3. Os dados coletados não serão compartilhados com terceiros, exceto quando estritamente necessário para cumprimento de obrigação legal ou cobrança judicial/extrajudicial em caso de inadimplemento.',
    );

    heading('CLÁUSULA SÉTIMA – DA VALIDADE DA ASSINATURA ELETRÔNICA / DIGITALIZADA');
    paragraph(
      'As partes expressamente concordam e reconhecem a validade, integridade e eficácia jurídica deste instrumento assinado por meio eletrônico, digitalizado ou mediante aplicação de imagem da assinatura do representante legal da LOCADORA, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, reconhecendo-o como título executivo extrajudicial bastante para todos os fins de direito.',
    );

    heading('CLÁUSULA OITAVA – DO FORO');
    paragraph(
      `Para dirimir quaisquer controvérsias oriundas do presente contrato, as partes elegem o Foro da Comarca de ${storeCity} - ${storeState}, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`,
    );

    paragraph(
      'E, por estarem assim justos e contratados, assinam o presente instrumento para que produza seus jurídicos e legais efeitos.',
    );
    // Keep the date and the signature block together. If there is not enough
    // room left on the page, move both to the next page before writing them.
    const dateTextHeight = 14;
    const requiredSpace = dateTextHeight + SIGNATURE_BLOCK_GAP + SIGNATURE_BLOCK_HEIGHT;
    if (doc.y + requiredSpace > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }

    doc
      .font('Helvetica')
      .fontSize(9.5)
      .text(`${storeCity} - ${storeState}, ${formatDateLong(issuedDate)}.`, { align: 'center' });

    // Signatures follow the document flow. The line position is persisted in
    // the PDF metadata so the signature overlay can be applied to the exact
    // audited draft without re-rendering the document.
    const signatureTop = doc.y + SIGNATURE_BLOCK_GAP;
    const signatureLineYFromBottom = doc.page.height - (signatureTop + SIGNATURE_LINE_OFFSET);
    doc.info.Keywords = `madri-signature-line-y=${signatureLineYFromBottom.toFixed(2)}`;

    const leftX = 60;
    const rightX = 305;
    const lineWidth = 220;

    const lessorSignatureBuffer = signatureToBuffer(store?.owner_signature);
    if (lessorSignatureBuffer) {
      doc.image(lessorSignatureBuffer, leftX, signatureTop, {
        fit: [lineWidth, SIGNATURE_LINE_OFFSET - 6],
        align: 'center',
        valign: 'bottom',
      });
    }
    doc
      .moveTo(leftX, signatureTop + SIGNATURE_LINE_OFFSET)
      .lineTo(leftX + lineWidth, signatureTop + SIGNATURE_LINE_OFFSET)
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(LESSOR_LEGAL_NAME, leftX, signatureTop + 65, {
        width: lineWidth,
        align: 'center',
      });
    doc.font('Helvetica').fontSize(8);
    doc.text(LESSOR_TRADE_NAME, leftX, signatureTop + 76, { width: lineWidth, align: 'center' });
    doc.text(`CNPJ: ${lessorCnpj}`, leftX, signatureTop + 87, {
      width: lineWidth,
      align: 'center',
    });
    doc.text(`Representante Legal: ${lessorRepresentative}`, leftX, signatureTop + 98, {
      width: lineWidth,
      align: 'center',
    });

    const signatureBuffer = signatureToBuffer(contract.lessee_signature);
    if (signatureBuffer) {
      doc.image(signatureBuffer, rightX + 50, signatureTop + 12, { width: 120 });
    }
    doc
      .moveTo(rightX, signatureTop + 60)
      .lineTo(rightX + lineWidth, signatureTop + 60)
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(lesseeName, rightX, signatureTop + 65, {
        width: lineWidth,
        align: 'center',
      });
    doc
      .font('Helvetica')
      .fontSize(8)
      .text(`CPF: ${lesseeCpf}`, rightX, signatureTop + 76, {
        width: lineWidth,
        align: 'center',
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('LOCATÁRIO', rightX, signatureTop + 88, {
        width: lineWidth,
        align: 'center',
      });

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
 * Renders the contract PDF into a Buffer (via a short-lived temp file).
 */
async function renderContractPdfBuffer(contract, data) {
  const outputPath = path.join(
    os.tmpdir(),
    `contrato_${contract.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pdf`,
  );

  try {
    await generateContractPdf(outputPath, { contract, ...data });
    return await fs.promises.readFile(outputPath);
  } finally {
    await safeUnlink(outputPath);
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

  // Store signatures are persisted as R2 object keys (paths). Load the image so
  // it can be embedded in the PDF; legacy data URLs keep working as-is.
  if (store?.owner_signature) {
    const signatureKey = extractKey(store.owner_signature);
    if (signatureKey) {
      try {
        const buffer = await downloadFile(signatureKey);
        store.owner_signature = `data:image/png;base64,${buffer.toString('base64')}`;
      } catch (error) {
        console.error('Erro ao carregar assinatura da loja:', error.message);
      }
    }
  }
  const issuedBy = userId ? await UserModel.findById(userId) : null;
  const totalPaid = await PaymentModel.getTotalPaidByRentalId(rental.id);
  // Chronological order for the contract payment history
  const payments = (await PaymentModel.findByRentalId(rental.id)).reverse();

  return { rental, customer, store, issuedBy, totalPaid, payments };
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
 * Materializes the definitive signed PDF in a temp file. New contracts are
 * read from the immutable signed_pdf_path in R2; legacy contracts fall back
 * to rendering the PDF from the stored signature.
 */
async function materializeSignedPdf(contract, data) {
  if (contract.signed_pdf_path) {
    const key = extractKey(contract.signed_pdf_path);
    if (key) {
      const buffer = await downloadFile(key);
      const filePath = path.join(
        os.tmpdir(),
        `contrato_${contract.id}_signed_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pdf`,
      );
      await fs.promises.writeFile(filePath, buffer);
      return { filePath, cleanup: () => safeUnlink(filePath) };
    }
  }

  const { unsignedPath, signedPath } = await renderSignedPdf(contract, data);
  await safeUnlink(unsignedPath);
  return { filePath: signedPath, cleanup: () => safeUnlink(signedPath) };
}

/**
 * Renders the unsigned contract preview for a rental into a temp PDF. The
 * lessee signature area is left blank so the customer can read the document
 * before signing it on the tablet.
 *
 * @returns {Promise<{ pdfPath: string, data: object }>} Temp PDF path and
 * loaded entities used to render it
 */
async function renderContractPreviewPdf(rentalId, userId) {
  const rental = await RentalModel.findById(rentalId);
  if (!rental) {
    throw new Error('RENTAL_NOT_FOUND');
  }
  if (rental.status === 'cancelled') {
    throw new Error('RENTAL_CANCELLED');
  }

  const previewContract = {
    id: rental.id,
    rental_id: rental.id,
    customer_id: rental.customer_id,
    contract_number: 'A DEFINIR',
    lessee_signature: null,
    issued_at: new Date(),
    created_by: userId || null,
  };
  const data = await loadContractData(previewContract, userId);
  const outputPath = path.join(os.tmpdir(), `contrato_preview_${rental.id}.pdf`);

  await generateContractPdf(outputPath, { contract: previewContract, ...data });

  return { pdfPath: outputPath, data };
}

/**
 * Step A: generates the original draft PDF, hashes it and persists it in R2.
 * The draft is never deleted — it is the primary technical evidence of the
 * exact content presented to the customer before signing.
 *
 * @returns {{ contract: object, documentHash: string, draftPdfPath: string,
 *   draftPdfUrl: string|null }}
 */
exports.generateContractDraft = async (rentalId, userId) => {
  const rental = await RentalModel.findById(rentalId);
  if (!rental) {
    throw new Error('RENTAL_NOT_FOUND');
  }
  if (rental.status === 'cancelled') {
    throw new Error('RENTAL_CANCELLED');
  }

  const contractId = uuidv4();
  const issuedAt = new Date();
  const baseContract = {
    id: contractId,
    rental_id: rentalId,
    customer_id: rental.customer_id,
    contract_number: null,
    lessee_signature: null,
    issued_at: issuedAt,
    created_by: userId || null,
  };

  // Load the rental/customer/store data before opening the transaction to keep
  // the FOR UPDATE lock window as short as possible.
  const data = await loadContractData(baseContract, userId);
  const prefix = resolveContractPrefix(data.store);
  const contractYear = issuedAt.getFullYear();

  let lastError;
  for (let attempt = 1; attempt <= CONTRACT_NUMBER_MAX_ATTEMPTS; attempt += 1) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const contractNumber = await ContractModel.generateContractNumber({
        prefix,
        year: contractYear,
        connection,
      });
      const draftContract = { ...baseContract, contract_number: contractNumber };

      // Insert the row before uploading so a concurrent duplicate number fails
      // here (unique index), never after an orphan PDF has been sent to R2.
      await ContractModel.create(
        {
          id: contractId,
          rentalId,
          customerId: rental.customer_id,
          contractNumber,
          lesseeSignature: null,
          issuedAt,
          createdBy: userId,
          status: 'draft',
          documentHash: '0'.repeat(64),
        },
        connection,
      );

      const draftBuffer = await renderContractPdfBuffer(draftContract, data);
      const documentHash = sha256(draftBuffer);
      const draftPdfPath = await uploadBuffer(
        draftBuffer,
        buildContractPdfKey(rentalId, contractId, 'draft.pdf'),
        'application/pdf',
      );

      const contract = await ContractModel.updateDraft(
        contractId,
        { documentHash, draftPdfPath, status: 'pending_signature' },
        connection,
      );

      await connection.commit();

      return {
        contract: contract || (await ContractModel.findById(contractId)),
        contractNumber,
        documentHash,
        draftPdfPath,
        draftPdfUrl: getPublicUrl(draftPdfPath),
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error rolling back contract transaction:', rollbackError.message);
      }

      lastError = error;
      if (TRANSIENT_DB_ERRORS.has(error.code) && attempt < CONTRACT_NUMBER_MAX_ATTEMPTS) {
        await sleep(25 * attempt);
        continue;
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  throw lastError;
};

/**
 * Step B: loads the original draft from R2, overlays the lessee signature on
 * its last page, persists the definitive PDF in R2 and records the audit trail.
 *
 * @returns {{ contract: object, signedPdfPath: string, signedPdfUrl: string|null }}
 */
exports.signContract = async (contractId, lesseeSignature, metadata = {}) => {
  if (!signatureToBuffer(lesseeSignature)) {
    throw new Error('INVALID_SIGNATURE');
  }

  const contract = await ContractModel.findById(contractId);
  if (!contract) {
    throw new Error('CONTRACT_NOT_FOUND');
  }
  if (contract.status === 'signed' || contract.signed_pdf_path) {
    throw new Error('CONTRACT_ALREADY_SIGNED');
  }
  if (!contract.draft_pdf_path) {
    throw new Error('DRAFT_NOT_FOUND');
  }

  const rental = await RentalModel.findById(contract.rental_id);
  if (!rental) {
    throw new Error('RENTAL_NOT_FOUND');
  }
  if (rental.status === 'cancelled') {
    throw new Error('RENTAL_CANCELLED');
  }

  const draftKey = extractKey(contract.draft_pdf_path);
  if (!draftKey) {
    throw new Error('DRAFT_NOT_FOUND');
  }

  const draftBuffer = await downloadFile(draftKey);
  if (contract.document_hash && sha256(draftBuffer) !== contract.document_hash) {
    throw new Error('DRAFT_HASH_MISMATCH');
  }

  const signedAt = metadata.signedAt ? new Date(metadata.signedAt) : new Date();
  const signedBuffer = await embedLesseeSignature(draftBuffer, lesseeSignature, {
    contractId,
    documentHash: contract.document_hash,
    signedAt,
  });

  const signedPdfPath = await uploadBuffer(
    signedBuffer,
    buildContractPdfKey(contract.rental_id, contract.id, 'signed.pdf'),
    'application/pdf',
  );

  await ContractModel.markSigned(contractId, {
    lesseeSignature,
    signedAt,
    signerIp: metadata.signerIp || null,
    deviceUserAgent: metadata.deviceUserAgent || null,
    signedPdfPath,
  });

  const signedContract = await ContractModel.findById(contractId);

  return {
    contract: signedContract,
    signedPdfPath,
    signedPdfUrl: getPublicUrl(signedPdfPath),
  };
};

/**
 * Cancels a contract, keeping its PDFs/hash as audit evidence and recording
 * the reason in notes. The rental can then receive a new contract.
 */
exports.cancelContract = async (contractId, notes) => {
  const contract = await ContractModel.findById(contractId);
  if (!contract) {
    throw new Error('CONTRACT_NOT_FOUND');
  }
  if (contract.status === 'cancelled') {
    throw new Error('CONTRACT_ALREADY_CANCELLED');
  }

  return ContractModel.cancel(contractId, notes);
};

/**
 * Backwards-compatible one-call flow: generates the draft and immediately
 * signs it. Both PDFs remain persisted in R2.
 *
 * @returns {{ contractId: string }}
 */
exports.issueContract = async (rentalId, userId, lesseeSignature, metadata = {}) => {
  const { contract } = await exports.generateContractDraft(rentalId, userId);
  const { contract: signedContract } = await exports.signContract(contract.id, lesseeSignature, {
    ...metadata,
    userId,
  });

  return {
    contractId: signedContract.id,
    contractNumber: signedContract.contract_number,
    documentHash: signedContract.document_hash,
    signedPdfPath: signedContract.signed_pdf_path,
  };
};

/**
 * Returns the definitive signed PDF. New contracts are downloaded from R2;
 * legacy contracts are re-rendered from the stored signature.
 */
exports.getContractPdfBuffer = async (contractId) => {
  const contract = await ContractModel.findById(contractId);
  if (!contract) {
    throw new Error('CONTRACT_NOT_FOUND');
  }

  if (contract.signed_pdf_path) {
    const key = extractKey(contract.signed_pdf_path);
    if (!key) {
      throw new Error('SIGNED_PDF_NOT_FOUND');
    }
    return downloadFile(key);
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
  const { filePath, cleanup } = await materializeSignedPdf(contract, data);

  let deliveryStatus = 'failed';
  try {
    const sent = await emailService.sendEmail({
      to: email,
      subject: `Contrato de Prestação de Serviços e Locação de Trajes a Rigor - ${data.store?.name || 'Madri Noivas'}`,
      text: `Olá, ${data.customer?.name || 'cliente'}! Segue em anexo o seu Contrato de Prestação de Serviços e Locação de Trajes a Rigor (Contrato Nº ${getContractNumberLabel(contract)}).`,
      attachments: [
        {
          filename: buildContractFileName(contract),
          path: filePath,
        },
      ],
    });
    deliveryStatus = sent ? 'sent' : 'failed';
  } catch (error) {
    console.error('Error sending contract %s via email:', contractId, error);
  } finally {
    await ContractModel.updateDeliveryStatus(contractId, 'email', deliveryStatus);
    await cleanup();
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
  const { filePath, cleanup } = await materializeSignedPdf(contract, data);

  let deliveryStatus = 'failed';
  try {
    const sent = await whatsappService.sendDocument({
      to: phone,
      filePath,
      fileName: buildContractFileName(contract),
      caption: `Contrato de Prestação de Serviços e Locação de Trajes a Rigor - ${data.store?.name || 'Madri Noivas'} (Contrato Nº ${getContractNumberLabel(contract)})`,
    });
    deliveryStatus = sent ? 'sent' : 'failed';
  } catch (error) {
    console.error('Error sending contract %s via WhatsApp:', contractId, error);
  } finally {
    await ContractModel.updateDeliveryStatus(contractId, 'whatsapp', deliveryStatus);
    await cleanup();
  }

  return { deliveryStatus };
};

/**
 * Sends the definitive signed contract to every contact available for the
 * customer (WhatsApp and e-mail). Used automatically after signing; failures
 * are recorded per channel and never break the signing flow.
 */
exports.dispatchSignedContract = async (contractId, userId) => {
  const contract = await ContractModel.findById(contractId);
  if (!contract) {
    throw new Error('CONTRACT_NOT_FOUND');
  }

  const customer = await CustomerModel.findById(contract.customer_id);
  const email = getCustomerEmail(customer);
  const phone = getCustomerPhone(customer);
  const result = { email: null, whatsapp: null };

  if (email) {
    const { deliveryStatus } = await exports.sendContractEmail(contractId, email, userId);
    result.email = deliveryStatus;
  }
  if (phone) {
    const { deliveryStatus } = await exports.sendContractWhatsApp(contractId, phone, userId);
    result.whatsapp = deliveryStatus;
  }

  return result;
};

/**
 * Sends the unsigned contract preview PDF via WhatsApp so the customer can
 * read the document on their own phone before signing it on the tablet.
 *
 * @returns {{ deliveryStatus: 'sent' | 'failed' }}
 */
exports.sendContractPreviewWhatsApp = async (rentalId, phone, userId) => {
  const { pdfPath } = await renderContractPreviewPdf(rentalId, userId);

  let deliveryStatus = 'failed';
  try {
    const sent = await whatsappService.sendDocument({
      to: phone,
      filePath: pdfPath,
      fileName: `previa_contrato_${rentalId.slice(0, 8)}.pdf`,
      caption: `Prévia do Contrato de Prestação de Serviços e Locação de Trajes a Rigor (Contrato Nº ${rentalId
        .slice(0, 8)
        .toUpperCase()})`,
    });
    deliveryStatus = sent ? 'sent' : 'failed';
  } catch (error) {
    console.error('Error sending contract preview %s via WhatsApp:', rentalId, error);
  } finally {
    await safeUnlink(pdfPath);
  }

  return { deliveryStatus };
};

/**
 * Renders the unsigned contract preview PDF and returns it as a Buffer.
 */
exports.getContractPreviewPdfBuffer = async (rentalId, userId) => {
  const { pdfPath } = await renderContractPreviewPdf(rentalId, userId);

  try {
    return await fs.promises.readFile(pdfPath);
  } finally {
    await safeUnlink(pdfPath);
  }
};

/**
 * Sends the unsigned contract preview PDF by e-mail so the customer can read
 * the document before signing it on the tablet.
 *
 * @returns {{ deliveryStatus: 'sent' | 'failed' }}
 */
exports.sendContractPreviewEmail = async (rentalId, email, userId) => {
  const { pdfPath, data } = await renderContractPreviewPdf(rentalId, userId);

  let deliveryStatus = 'failed';
  try {
    const sent = await emailService.sendEmail({
      to: email,
      subject: `Prévia do Contrato de Prestação de Serviços e Locação de Trajes a Rigor - ${data.store?.name || 'Madri Noivas'}`,
      text: `Olá, ${data.customer?.name || 'cliente'}! Segue em anexo a prévia do seu Contrato de Prestação de Serviços e Locação de Trajes a Rigor (Contrato Nº ${rentalId
        .slice(0, 8)
        .toUpperCase()}).`,
      attachments: [
        {
          filename: `previa_contrato_${rentalId.slice(0, 8)}.pdf`,
          path: pdfPath,
        },
      ],
    });
    deliveryStatus = sent ? 'sent' : 'failed';
  } catch (error) {
    console.error('Error sending contract preview %s via email:', rentalId, error);
  } finally {
    await safeUnlink(pdfPath);
  }

  return { deliveryStatus };
};
