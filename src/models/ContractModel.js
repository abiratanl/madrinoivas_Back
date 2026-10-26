const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const DELIVERY_STATUS_COLUMNS = {
  whatsapp: 'whatsapp_delivery_status',
  email: 'email_delivery_status',
};

class ContractModel {
  /**
   * Registers a rental contract. Drafts are created without a signature and
   * carry the hash/R2 key of the original PDF; signing fills the audit fields
   * and the R2 key of the final PDF.
   */
  static async create(
    {
      id,
      rentalId,
      customerId,
      contractNumber = null,
      lesseeSignature = null,
      issuedAt,
      createdBy,
      status = 'draft',
      documentHash = null,
      signedAt = null,
      signerIp = null,
      deviceUserAgent = null,
      draftPdfPath = null,
      signedPdfPath = null,
    },
    connection = null,
  ) {
    const executor = connection || db;
    const contractId = id || uuidv4();
    await executor.query(
      `INSERT INTO contracts
        (id, rental_id, customer_id, contract_number, status, lessee_signature,
         document_hash, signed_at, signer_ip, device_user_agent, draft_pdf_path,
         signed_pdf_path, issued_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contractId,
        rentalId,
        customerId,
        contractNumber,
        status,
        lesseeSignature,
        documentHash,
        signedAt,
        signerIp,
        deviceUserAgent,
        draftPdfPath,
        signedPdfPath,
        issuedAt,
        createdBy || null,
      ],
    );
    return ContractModel.findById(contractId, executor);
  }

  /**
   * Reserves the next sequential contract number for the given prefix/year.
   * MUST be called inside an active transaction: the SELECT ... FOR UPDATE
   * locks the current last row and the unique index on contract_number is the
   * final guard against concurrent inserts.
   */
  static async generateContractNumber({ prefix = 'MADRI', year, connection }) {
    const executor = connection || db;
    const contractYear = year || new Date().getFullYear();
    const numberPrefix = `${prefix}-${contractYear}-`;

    const [rows] = await executor.query(
      `SELECT contract_number
         FROM contracts
        WHERE contract_number LIKE ?
        ORDER BY CAST(SUBSTRING_INDEX(contract_number, '-', -1) AS UNSIGNED) DESC
        LIMIT 1
        FOR UPDATE`,
      [`${numberPrefix}%`],
    );

    let nextSequence = 1;
    if (rows[0]?.contract_number) {
      const match = /-(\d+)$/.exec(rows[0].contract_number);
      if (match) {
        nextSequence = Number.parseInt(match[1], 10) + 1;
      }
    }

    return `${numberPrefix}${String(nextSequence).padStart(4, '0')}`;
  }

  /**
   * Completes a draft contract after the PDF has been generated and uploaded.
   */
  static async updateDraft(
    id,
    { documentHash, draftPdfPath, status = 'pending_signature' },
    connection = null,
  ) {
    const executor = connection || db;
    await executor.query(
      `UPDATE contracts
          SET document_hash = ?,
              draft_pdf_path = ?,
              status = ?
        WHERE id = ?`,
      [documentHash, draftPdfPath, status, id],
    );
    return ContractModel.findById(id, executor);
  }

  /**
   * Marks a draft as signed and stores the final PDF location plus the
   * signature audit metadata.
   */
  static async markSigned(
    id,
    { lesseeSignature, signedAt, signerIp, deviceUserAgent, signedPdfPath },
  ) {
    await db.query(
      `UPDATE contracts
          SET status = 'signed',
              lessee_signature = ?,
              signed_at = ?,
              signer_ip = ?,
              device_user_agent = ?,
              signed_pdf_path = ?
        WHERE id = ?`,
      [lesseeSignature, signedAt, signerIp || null, deviceUserAgent || null, signedPdfPath, id],
    );
    return ContractModel.findById(id);
  }

  /**
   * Finds a contract by id.
   */
  static async findById(id, connection = null) {
    const executor = connection || db;
    const [rows] = await executor.query('SELECT * FROM contracts WHERE id = ?', [id]);
    return rows[0] || null;
  }

  /**
   * Lists all contracts issued for a rental, most recent first.
   */
  static async findByRentalId(rentalId) {
    const [rows] = await db.query(
      'SELECT * FROM contracts WHERE rental_id = ? ORDER BY issued_at DESC',
      [rentalId],
    );
    return rows;
  }

  /**
   * Cancels a contract and records the reason in notes. The original PDFs and
   * hash are kept as audit evidence; a new contract can then be issued.
   */
  static async cancel(id, notes) {
    await db.query(
      `UPDATE contracts
          SET status = 'cancelled',
              notes = ?
        WHERE id = ?
          AND status <> 'cancelled'`,
      [notes, id],
    );
    return ContractModel.findById(id);
  }

  /**
   * Updates the delivery status of a contract for a given channel
   * ('whatsapp' | 'email') to 'pending' | 'sent' | 'failed'.
   */
  static async updateDeliveryStatus(id, channel, status) {
    const column = DELIVERY_STATUS_COLUMNS[channel];
    if (!column) {
      throw new Error(`Unknown delivery channel: ${channel}`);
    }
    await db.query(`UPDATE contracts SET ${column} = ? WHERE id = ?`, [status, id]);
  }
}

module.exports = ContractModel;
