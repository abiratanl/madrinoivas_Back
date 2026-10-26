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
const { downloadFile, extractKey } = require('./uploadService');
const signer = require('./signing');

const SIGNATURE_DATA_URL_REGEX = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/;

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
      .fontSize(13.5)
      .text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS E LOCAÇÃO DE TRAJES A RIGOR', {
        align: 'center',
      });
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .text(`Contrato Nº: ${contract.id.slice(0, 8).toUpperCase()}`, { align: 'center' });

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
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .text(`${storeCity} - ${storeState}, ${formatDateLong(issuedDate)}.`, { align: 'center' });

    // Signatures (start a new page when the block would not fit)
    doc.moveDown(1.2);
    if (doc.y > 600) {
      doc.addPage();
    }

    const headingY = doc.y;
    doc.font('Helvetica-Bold').fontSize(11).text('ASSINATURAS', { align: 'center' });
    doc.y = headingY + 24;

    const signatureTop = doc.y;
    const leftX = 60;
    const rightX = 305;
    const lineWidth = 220;

    const lessorSignatureBuffer = signatureToBuffer(store?.owner_signature);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .text('(Assinatura Digitalizada/Escaneada do Representante Legal)', leftX, signatureTop, {
        width: lineWidth,
        align: 'center',
      });
    if (lessorSignatureBuffer) {
      doc.image(lessorSignatureBuffer, leftX + 50, signatureTop + 12, { width: 120 });
    }
    doc
      .moveTo(leftX, signatureTop + 60)
      .lineTo(leftX + lineWidth, signatureTop + 60)
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
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .text('(ASSINATURA NA TELA DO TABLET)', rightX, signatureTop, {
        width: lineWidth,
        align: 'center',
      });
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
      subject: `Contrato de Prestação de Serviços e Locação de Trajes a Rigor - ${data.store?.name || 'Madri Noivas'}`,
      text: `Olá, ${data.customer?.name || 'cliente'}! Segue em anexo o seu Contrato de Prestação de Serviços e Locação de Trajes a Rigor (Contrato Nº ${contract.id
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
      caption: `Contrato de Prestação de Serviços e Locação de Trajes a Rigor - ${data.store?.name || 'Madri Noivas'}`,
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
