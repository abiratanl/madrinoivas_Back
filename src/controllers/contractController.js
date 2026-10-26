const RentalModel = require('../models/RentalModel');
const ContractModel = require('../models/ContractModel');
const contractService = require('../services/contractService');

/**
 * POST /api/rentals/:id/contract
 * Generates a signed rental contract PDF from the lessee digital signature
 * (data URL) and registers it. Returns the contract id and the PDF URL.
 */
exports.generateContract = async (req, res) => {
  try {
    const { id } = req.params;
    const { lessee_signature } = req.body || {};

    if (!lessee_signature) {
      return res.status(400).json({ message: 'A assinatura da locatária é obrigatória.' });
    }

    const rental = await RentalModel.findById(id);
    if (!rental) {
      return res.status(404).json({ message: 'Aluguel não encontrado.' });
    }
    if (rental.status === 'cancelled') {
      return res
        .status(422)
        .json({ message: 'Não é possível gerar contrato de um aluguel cancelado.' });
    }

    let contractId;
    try {
      ({ contractId } = await contractService.issueContract(id, req.user.id, lessee_signature));
    } catch (error) {
      if (error.message === 'INVALID_SIGNATURE') {
        return res
          .status(400)
          .json({ message: 'Assinatura inválida. Capture a assinatura novamente.' });
      }
      throw error;
    }

    res.status(201).json({
      status: 'success',
      message: 'Contrato gerado com sucesso.',
      data: { id: contractId, pdf_url: `/api/contracts/${contractId}/pdf` },
    });
  } catch (error) {
    console.error('Error generating contract:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao gerar contrato.' });
  }
};

/**
 * GET /api/rentals/:id/contract
 * Returns the most recent signed contract metadata for a rental.
 */
exports.getContractByRental = async (req, res) => {
  try {
    const { id } = req.params;

    const contracts = await ContractModel.findByRentalId(id);
    if (contracts.length === 0) {
      return res.status(404).json({ message: 'Nenhum contrato gerado para este aluguel.' });
    }

    const contract = contracts[0];
    res.status(200).json({
      status: 'success',
      data: {
        id: contract.id,
        rental_id: contract.rental_id,
        customer_id: contract.customer_id,
        issued_at: contract.issued_at,
        whatsapp_delivery_status: contract.whatsapp_delivery_status,
        email_delivery_status: contract.email_delivery_status,
        pdf_url: `/api/contracts/${contract.id}/pdf`,
      },
    });
  } catch (error) {
    console.error('Error fetching contract by rental:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar o contrato do aluguel.' });
  }
};

/**
 * GET /api/rentals/:id/contract/pdf
 * Re-renders the PDF of the most recent contract of a rental.
 */
exports.getContractPdfByRental = async (req, res) => {
  try {
    const { id } = req.params;

    const contracts = await ContractModel.findByRentalId(id);
    if (contracts.length === 0) {
      return res.status(404).json({ message: 'Nenhum contrato gerado para este aluguel.' });
    }

    const contract = contracts[0];
    const pdfBuffer = await contractService.getContractPdfBuffer(contract.id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contrato_${contract.id.slice(0, 8)}.pdf"`,
    });
    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading contract PDF:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao baixar o contrato.' });
  }
};

/**
 * GET /api/contracts/:id/pdf
 * Re-renders the signed contract PDF and returns it for download/printing.
 */
exports.getContractPdf = async (req, res) => {
  try {
    const { id } = req.params;

    const contract = await ContractModel.findById(id);
    if (!contract) {
      return res.status(404).json({ message: 'Contrato não encontrado.' });
    }

    const pdfBuffer = await contractService.getContractPdfBuffer(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contrato_${id.slice(0, 8)}.pdf"`,
    });
    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading contract PDF:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao baixar o contrato.' });
  }
};

/**
 * POST /api/contracts/:id/send-email
 * Sends the signed contract PDF to the given e-mail address.
 */
exports.sendContractEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: 'O e-mail do cliente é obrigatório.' });
    }

    const contract = await ContractModel.findById(id);
    if (!contract) {
      return res.status(404).json({ message: 'Contrato não encontrado.' });
    }

    const { deliveryStatus } = await contractService.sendContractEmail(id, email, req.user.id);

    if (deliveryStatus !== 'sent') {
      return res.status(502).json({
        status: 'error',
        message: 'Não foi possível enviar o contrato por e-mail.',
        data: { emailDeliveryStatus: deliveryStatus },
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Contrato enviado por e-mail com sucesso.',
      data: { emailDeliveryStatus: deliveryStatus },
    });
  } catch (error) {
    console.error('Error sending contract by email:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao enviar contrato por e-mail.' });
  }
};

/**
 * POST /api/rentals/:id/contract/send-whatsapp
 * Sends the unsigned contract preview PDF to the given WhatsApp number so the
 * customer can read it before signing on the tablet.
 */
exports.sendContractPreviewWhatsApp = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({ message: 'O telefone do cliente é obrigatório.' });
    }

    const rental = await RentalModel.findById(id);
    if (!rental) {
      return res.status(404).json({ message: 'Aluguel não encontrado.' });
    }
    if (rental.status === 'cancelled') {
      return res
        .status(422)
        .json({ message: 'Não é possível enviar a prévia de um aluguel cancelado.' });
    }

    const { deliveryStatus } = await contractService.sendContractPreviewWhatsApp(
      id,
      phone,
      req.user.id,
    );

    res.status(200).json({
      status: deliveryStatus === 'sent' ? 'success' : 'error',
      message:
        deliveryStatus === 'sent'
          ? 'Prévia do contrato enviada por WhatsApp com sucesso.'
          : 'Não foi possível enviar a prévia do contrato por WhatsApp.',
      data: { whatsappDeliveryStatus: deliveryStatus },
    });
  } catch (error) {
    console.error('Error sending contract preview by WhatsApp:', error);
    res
      .status(500)
      .json({ status: 'error', message: 'Erro ao enviar a prévia do contrato por WhatsApp.' });
  }
};

/**
 * GET /api/rentals/:id/contract/preview/pdf
 * Renders the unsigned contract preview PDF for download/printing.
 */
exports.getContractPreviewPdfByRental = async (req, res) => {
  try {
    const { id } = req.params;

    const pdfBuffer = await contractService.getContractPreviewPdfBuffer(id, req.user.id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="previa_contrato_${id.slice(0, 8)}.pdf"`,
    });
    res.status(200).send(pdfBuffer);
  } catch (error) {
    if (error.message === 'RENTAL_NOT_FOUND') {
      return res.status(404).json({ message: 'Aluguel não encontrado.' });
    }
    if (error.message === 'RENTAL_CANCELLED') {
      return res
        .status(422)
        .json({ message: 'Não é possível gerar a prévia de um aluguel cancelado.' });
    }
    console.error('Error generating contract preview PDF:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao gerar a prévia do contrato.' });
  }
};

/**
 * POST /api/rentals/:id/contract/send-email
 * Sends the unsigned contract preview PDF to the given e-mail address so the
 * customer can read it before signing on the tablet.
 */
exports.sendContractPreviewEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: 'O e-mail do cliente é obrigatório.' });
    }

    const rental = await RentalModel.findById(id);
    if (!rental) {
      return res.status(404).json({ message: 'Aluguel não encontrado.' });
    }
    if (rental.status === 'cancelled') {
      return res
        .status(422)
        .json({ message: 'Não é possível enviar a prévia de um aluguel cancelado.' });
    }

    const { deliveryStatus } = await contractService.sendContractPreviewEmail(
      id,
      email,
      req.user.id,
    );

    res.status(200).json({
      status: deliveryStatus === 'sent' ? 'success' : 'error',
      message:
        deliveryStatus === 'sent'
          ? 'Prévia do contrato enviada por e-mail com sucesso.'
          : 'Não foi possível enviar a prévia do contrato por e-mail.',
      data: { emailDeliveryStatus: deliveryStatus },
    });
  } catch (error) {
    console.error('Error sending contract preview by email:', error);
    res
      .status(500)
      .json({ status: 'error', message: 'Erro ao enviar a prévia do contrato por e-mail.' });
  }
};

/**
 * POST /api/contracts/:id/send-whatsapp
 * Sends the signed contract PDF to the given WhatsApp number.
 */
exports.sendContractWhatsApp = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({ message: 'O telefone do cliente é obrigatório.' });
    }

    const contract = await ContractModel.findById(id);
    if (!contract) {
      return res.status(404).json({ message: 'Contrato não encontrado.' });
    }

    const { deliveryStatus } = await contractService.sendContractWhatsApp(id, phone, req.user.id);

    res.status(200).json({
      status: deliveryStatus === 'sent' ? 'success' : 'error',
      message:
        deliveryStatus === 'sent'
          ? 'Contrato enviado por WhatsApp com sucesso.'
          : 'Não foi possível enviar o contrato por WhatsApp.',
      data: { whatsappDeliveryStatus: deliveryStatus },
    });
  } catch (error) {
    console.error('Error sending contract by WhatsApp:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao enviar contrato por WhatsApp.' });
  }
};
