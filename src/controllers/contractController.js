const RentalModel = require('../models/RentalModel');
const ContractModel = require('../models/ContractModel');
const contractService = require('../services/contractService');

/**
 * Captures the signing audit metadata from the tablet request.
 */
function getAuditMetadata(req) {
  return {
    signerIp: req.ip,
    deviceUserAgent: req.headers['user-agent'] || null,
    signedAt: new Date(),
  };
}

/**
 * After signing, deliver the definitive PDF to the customer's WhatsApp/e-mail
 * contacts without blocking the HTTP response. Disabled in tests.
 */
function triggerAutomaticDelivery(contractId, userId) {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.CONTRACT_AUTO_DELIVERY === 'false' ||
    typeof contractService.dispatchSignedContract !== 'function'
  ) {
    return;
  }

  contractService.dispatchSignedContract(contractId, userId).catch((error) => {
    console.error('Error dispatching signed contract %s:', contractId, error);
  });
}

/**
 * POST /api/contracts/generate
 * Generates and persists the original draft PDF in R2 (Step A).
 */
exports.generateContractDraft = async (req, res) => {
  try {
    const rentalId = req.body?.rental_id || req.body?.rentalId || req.body?.id;
    if (!rentalId) {
      return res.status(400).json({ message: 'O aluguel é obrigatório.' });
    }

    const { contract, contractNumber, documentHash, draftPdfPath, draftPdfUrl } =
      await contractService.generateContractDraft(rentalId, req.user.id);

    res.status(201).json({
      status: 'success',
      message: 'Contrato gerado e aguardando assinatura.',
      data: {
        id: contract.id,
        rental_id: contract.rental_id,
        customer_id: contract.customer_id,
        contract_number: contract.contract_number || contractNumber,
        status: contract.status,
        document_hash: documentHash,
        draft_pdf_path: draftPdfPath,
        draft_pdf_url: draftPdfUrl,
        issued_at: contract.issued_at,
      },
    });
  } catch (error) {
    if (error.message === 'RENTAL_NOT_FOUND') {
      return res.status(404).json({ message: 'Aluguel não encontrado.' });
    }
    if (error.message === 'RENTAL_CANCELLED') {
      return res
        .status(422)
        .json({ message: 'Não é possível gerar contrato de um aluguel cancelado.' });
    }
    console.error('Error generating contract draft:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao gerar contrato.' });
  }
};

/**
 * POST /api/contracts/:id/sign
 * Overlays the tablet signature on the draft, persists the definitive PDF in
 * R2 and records the audit metadata (Step B).
 */
exports.signContract = async (req, res) => {
  try {
    const { id } = req.params;
    const { lessee_signature } = req.body || {};

    if (!lessee_signature) {
      return res.status(400).json({ message: 'A assinatura da locatária é obrigatória.' });
    }

    const metadata = getAuditMetadata(req);
    let result;
    try {
      result = await contractService.signContract(id, lessee_signature, metadata);
    } catch (error) {
      if (error.message === 'INVALID_SIGNATURE') {
        return res
          .status(400)
          .json({ message: 'Assinatura inválida. Capture a assinatura novamente.' });
      }
      if (error.message === 'CONTRACT_NOT_FOUND') {
        return res.status(404).json({ message: 'Contrato não encontrado.' });
      }
      if (error.message === 'CONTRACT_ALREADY_SIGNED') {
        return res.status(409).json({ message: 'Este contrato já foi assinado.' });
      }
      if (error.message === 'DRAFT_NOT_FOUND' || error.message === 'DRAFT_HASH_MISMATCH') {
        return res.status(409).json({
          message: 'O PDF original não está disponível ou falhou na verificação de integridade.',
        });
      }
      if (error.message === 'RENTAL_CANCELLED') {
        return res
          .status(422)
          .json({ message: 'Não é possível assinar o contrato de um aluguel cancelado.' });
      }
      throw error;
    }

    triggerAutomaticDelivery(id, req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'Contrato assinado com sucesso.',
      data: {
        id: result.contract.id,
        contract_number: result.contract.contract_number,
        status: result.contract.status,
        document_hash: result.contract.document_hash,
        signed_at: result.contract.signed_at,
        signer_ip: result.contract.signer_ip,
        device_user_agent: result.contract.device_user_agent,
        draft_pdf_path: result.contract.draft_pdf_path,
        signed_pdf_path: result.signedPdfPath,
        signed_pdf_url: result.signedPdfUrl,
        pdf_url: `/api/contracts/${result.contract.id}/pdf`,
      },
    });
  } catch (error) {
    console.error('Error signing contract:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao assinar contrato.' });
  }
};

/**
 * POST /api/contracts/:id/cancel
 * Cancels a contract (admin, owner or local_manager only), records the reason
 * in notes and keeps the PDFs/hash as audit evidence.
 */
exports.cancelContract = async (req, res) => {
  try {
    const { id } = req.params;
    const rawNotes = req.body?.notes ?? req.body?.reason;
    const notes = typeof rawNotes === 'string' ? rawNotes.trim() : '';

    if (!notes) {
      return res.status(400).json({ message: 'Informe o motivo do cancelamento.' });
    }
    if (notes.length > 2000) {
      return res
        .status(400)
        .json({ message: 'O motivo do cancelamento deve ter no máximo 2000 caracteres.' });
    }

    let contract;
    try {
      contract = await contractService.cancelContract(id, notes);
    } catch (error) {
      if (error.message === 'CONTRACT_NOT_FOUND') {
        return res.status(404).json({ message: 'Contrato não encontrado.' });
      }
      if (error.message === 'CONTRACT_ALREADY_CANCELLED') {
        return res.status(409).json({ message: 'Este contrato já está cancelado.' });
      }
      throw error;
    }

    res.status(200).json({
      status: 'success',
      message: 'Contrato cancelado com sucesso.',
      data: {
        id: contract.id,
        contract_number: contract.contract_number,
        status: contract.status,
        notes: contract.notes,
      },
    });
  } catch (error) {
    console.error('Error cancelling contract:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao cancelar contrato.' });
  }
};

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
    let contractNumber;
    try {
      ({ contractId, contractNumber } = await contractService.issueContract(
        id,
        req.user.id,
        lessee_signature,
        getAuditMetadata(req),
      ));
    } catch (error) {
      if (error.message === 'INVALID_SIGNATURE') {
        return res
          .status(400)
          .json({ message: 'Assinatura inválida. Capture a assinatura novamente.' });
      }
      throw error;
    }

    triggerAutomaticDelivery(contractId, req.user.id);

    res.status(201).json({
      status: 'success',
      message: 'Contrato gerado com sucesso.',
      data: {
        id: contractId,
        contract_number: contractNumber,
        pdf_url: `/api/contracts/${contractId}/pdf`,
      },
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

    const signedContract =
      contracts.find((item) => item.status === 'signed') ||
      contracts.find((item) => !item.status) ||
      null;

    if (!signedContract) {
      return res.status(404).json({ message: 'Nenhum contrato assinado para este aluguel.' });
    }

    res.status(200).json({
      status: 'success',
      data: {
        id: signedContract.id,
        rental_id: signedContract.rental_id,
        customer_id: signedContract.customer_id,
        contract_number: signedContract.contract_number || null,
        status: signedContract.status || 'signed',
        issued_at: signedContract.issued_at,
        signed_at: signedContract.signed_at || null,
        document_hash: signedContract.document_hash || null,
        whatsapp_delivery_status: signedContract.whatsapp_delivery_status,
        email_delivery_status: signedContract.email_delivery_status,
        pdf_url: `/api/contracts/${signedContract.id}/pdf`,
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
