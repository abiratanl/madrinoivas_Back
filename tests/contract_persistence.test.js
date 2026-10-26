const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');

const RentalModel = require('../src/models/RentalModel');
const CustomerModel = require('../src/models/CustomerModel');
const StoreModel = require('../src/models/StoreModel');
const UserModel = require('../src/models/UserModel');
const PaymentModel = require('../src/models/PaymentModel');
const ContractModel = require('../src/models/ContractModel');
const db = require('../src/config/database');
const uploadService = require('../src/services/uploadService');
const contractService = require('../src/services/contractService');

jest.mock('../src/config/database', () => ({
  getConnection: jest.fn(),
  query: jest.fn(),
}));
jest.mock('../src/models/RentalModel');
jest.mock('../src/models/CustomerModel');
jest.mock('../src/models/StoreModel');
jest.mock('../src/models/UserModel');
jest.mock('../src/models/PaymentModel');
jest.mock('../src/models/ContractModel');
jest.mock('../src/services/uploadService');

const VALID_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function mockRentalData() {
  RentalModel.findById.mockResolvedValue({
    id: 'rental-1',
    customer_id: 'customer-1',
    store_id: 'store-1',
    status: 'reserved',
    total_amount: 1000,
    start_date: '2026-11-01',
    end_date_scheduled: '2026-11-05',
    fitting_date: '2026-10-30T10:00:00.000Z',
    items: [],
  });
  CustomerModel.findById.mockResolvedValue({
    id: 'customer-1',
    name: 'Cliente Teste',
    cpf: '123.456.789-00',
    addresses: [],
    contacts: [],
  });
  StoreModel.findById.mockResolvedValue({ id: 'store-1', name: 'Madri Noivas' });
  UserModel.findById.mockResolvedValue(null);
  PaymentModel.getTotalPaidByRentalId.mockResolvedValue(0);
  PaymentModel.findByRentalId.mockResolvedValue([]);
}

function mockConnection() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
    query: jest.fn(),
  };
}

describe('Contract dual PDF persistence', () => {
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRentalData();
    connection = mockConnection();
    db.getConnection.mockResolvedValue(connection);
    uploadService.uploadBuffer.mockImplementation(async (_buffer, key) => key);
    uploadService.extractKey.mockImplementation((value) => value);
    uploadService.getPublicUrl.mockImplementation((key) => `https://cdn.test/${key}`);
  });

  it('generates a sequential number inside the transaction and stores the draft in R2', async () => {
    ContractModel.generateContractNumber.mockResolvedValue('MADRI-2026-0001');
    ContractModel.create.mockResolvedValue({ id: 'contract-1' });
    ContractModel.updateDraft.mockImplementation(async (id, payload) => ({
      id,
      rental_id: 'rental-1',
      customer_id: 'customer-1',
      contract_number: 'MADRI-2026-0001',
      status: payload.status,
      document_hash: payload.documentHash,
      draft_pdf_path: payload.draftPdfPath,
    }));

    const result = await contractService.generateContractDraft('rental-1', 'user-1');

    expect(ContractModel.generateContractNumber).toHaveBeenCalledWith({
      prefix: 'MADRI',
      year: new Date().getFullYear(),
      connection,
    });
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(uploadService.uploadBuffer).toHaveBeenCalledTimes(1);
    const [draftBuffer, key, contentType] = uploadService.uploadBuffer.mock.calls[0];
    expect(key).toBe(`contracts/rental-1/${result.contract.id}/draft.pdf`);
    expect(contentType).toBe('application/pdf');
    expect(draftBuffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.documentHash).toBe(sha256(draftBuffer));
    expect(result.contract.contract_number).toBe('MADRI-2026-0001');
    expect(ContractModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rentalId: 'rental-1',
        contractNumber: 'MADRI-2026-0001',
        status: 'draft',
        documentHash: '0'.repeat(64),
      }),
      connection,
    );
    expect(ContractModel.updateDraft).toHaveBeenCalledWith(
      result.contract.id,
      {
        documentHash: result.documentHash,
        draftPdfPath: key,
        status: 'pending_signature',
      },
      connection,
    );
  });

  it('retries with a new number when a concurrent insert hits the unique index', async () => {
    const duplicateError = Object.assign(new Error('Duplicate entry'), {
      code: 'ER_DUP_ENTRY',
    });
    const secondConnection = mockConnection();
    db.getConnection.mockResolvedValueOnce(connection).mockResolvedValueOnce(secondConnection);
    ContractModel.generateContractNumber
      .mockResolvedValueOnce('MADRI-2026-0001')
      .mockResolvedValueOnce('MADRI-2026-0002');
    ContractModel.create
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce({ id: 'contract-2' });
    ContractModel.updateDraft.mockImplementation(async (id, payload) => ({
      id,
      contract_number: 'MADRI-2026-0002',
      ...payload,
    }));

    const result = await contractService.generateContractDraft('rental-1', 'user-1');

    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(secondConnection.commit).toHaveBeenCalled();
    expect(secondConnection.release).toHaveBeenCalled();
    expect(result.contract.contract_number).toBe('MADRI-2026-0002');
    expect(ContractModel.generateContractNumber).toHaveBeenCalledTimes(2);
  });

  it('cancels a contract and records the cancellation reason', async () => {
    ContractModel.findById.mockResolvedValue({ id: 'contract-1', status: 'signed' });
    ContractModel.cancel.mockResolvedValue({
      id: 'contract-1',
      status: 'cancelled',
      notes: 'Cliente desistiu do evento.',
    });

    const result = await contractService.cancelContract(
      'contract-1',
      'Cliente desistiu do evento.',
    );

    expect(ContractModel.cancel).toHaveBeenCalledWith('contract-1', 'Cliente desistiu do evento.');
    expect(result.status).toBe('cancelled');
    expect(result.notes).toBe('Cliente desistiu do evento.');
  });

  it('rejects cancelling an already cancelled contract', async () => {
    ContractModel.findById.mockResolvedValue({ id: 'contract-1', status: 'cancelled' });

    await expect(contractService.cancelContract('contract-1', 'Outro motivo.')).rejects.toThrow(
      'CONTRACT_ALREADY_CANCELLED',
    );
    expect(ContractModel.cancel).not.toHaveBeenCalled();
  });

  it('downloads the draft, validates its hash, overlays the signature and stores the signed PDF', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    const draftBuffer = Buffer.from(await pdfDoc.save());

    const draftContract = {
      id: 'contract-1',
      rental_id: 'rental-1',
      customer_id: 'customer-1',
      status: 'pending_signature',
      document_hash: sha256(draftBuffer),
      draft_pdf_path: 'contracts/rental-1/contract-1/draft.pdf',
    };
    const signedContract = {
      ...draftContract,
      status: 'signed',
      signed_pdf_path: 'contracts/rental-1/contract-1/signed.pdf',
    };

    ContractModel.findById
      .mockResolvedValueOnce(draftContract)
      .mockResolvedValueOnce(signedContract);
    ContractModel.markSigned.mockResolvedValue(true);
    uploadService.downloadFile.mockResolvedValue(draftBuffer);
    uploadService.uploadBuffer.mockImplementation(async (_buffer, key) => key);

    const signedAt = new Date('2026-10-26T12:30:45.123Z');
    const result = await contractService.signContract('contract-1', VALID_SIGNATURE, {
      signerIp: '203.0.113.10',
      deviceUserAgent: 'TabletTest/1.0',
      signedAt,
    });

    expect(uploadService.downloadFile).toHaveBeenCalledWith(
      'contracts/rental-1/contract-1/draft.pdf',
    );
    expect(uploadService.uploadBuffer).toHaveBeenCalledTimes(1);
    const [signedBuffer, key, contentType] = uploadService.uploadBuffer.mock.calls[0];
    expect(key).toBe('contracts/rental-1/contract-1/signed.pdf');
    expect(contentType).toBe('application/pdf');
    expect(signedBuffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.signedPdfPath).toBe(key);
    expect(ContractModel.markSigned).toHaveBeenCalledWith('contract-1', {
      lesseeSignature: VALID_SIGNATURE,
      signedAt,
      signerIp: '203.0.113.10',
      deviceUserAgent: 'TabletTest/1.0',
      signedPdfPath: key,
    });
  });

  it('rejects signing when the draft hash does not match', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
    const draftBuffer = Buffer.from(await pdfDoc.save());

    ContractModel.findById.mockResolvedValue({
      id: 'contract-1',
      rental_id: 'rental-1',
      customer_id: 'customer-1',
      status: 'pending_signature',
      document_hash: 'f'.repeat(64),
      draft_pdf_path: 'contracts/rental-1/contract-1/draft.pdf',
    });
    uploadService.downloadFile.mockResolvedValue(draftBuffer);

    await expect(contractService.signContract('contract-1', VALID_SIGNATURE)).rejects.toThrow(
      'DRAFT_HASH_MISMATCH',
    );
    expect(uploadService.uploadBuffer).not.toHaveBeenCalled();
    expect(ContractModel.markSigned).not.toHaveBeenCalled();
  });
});
