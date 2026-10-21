const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const app = require('../src/app');
const PaymentModel = require('../src/models/PaymentModel');
const ReceiptModel = require('../src/models/ReceiptModel');
const receiptService = require('../src/services/receiptService');

// =================================================================
// 1. MOCKS
// =================================================================

jest.mock('../src/models/PaymentModel');
jest.mock('../src/models/ReceiptModel');
jest.mock('../src/services/receiptService');

jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'user-caixa', role: 'attendant', storeId: 'store-A' };
    next();
  },
  restrictTo:
    (..._roles) =>
    (req, res, next) =>
      next(),
}));

// =================================================================
// 2. API TESTS
// =================================================================
describe('Payment Receipts API', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- ISSUE RECEIPT (POST /:id/receipt) ---

  it('POST /api/payments/:id/receipt › Should issue a receipt successfully', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 100,
      status: 'confirmed',
    });
    receiptService.issueReceipt.mockResolvedValue({
      receiptId: 'receipt-1',
      deliveryStatus: 'sent',
    });

    const res = await request(app).post('/api/payments/pay-1/receipt');

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/recibo emitido/i);
    expect(res.body.data.receiptId).toBe('receipt-1');
    expect(res.body.data.whatsappDeliveryStatus).toBe('sent');
    expect(receiptService.issueReceipt).toHaveBeenCalledWith('pay-1', 'user-caixa', {
      sendWhatsApp: true,
    });
  });

  it('POST /api/payments/:id/receipt › Should return the PDF when sendWhatsApp is false', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 100,
      status: 'confirmed',
    });
    receiptService.issueReceipt.mockResolvedValue({
      receiptId: 'receipt-1',
      deliveryStatus: 'pending',
      pdfBuffer: Buffer.from('%PDF-fake'),
    });

    const res = await request(app)
      .post('/api/payments/pay-1/receipt')
      .send({ sendWhatsApp: false });

    expect(res.statusCode).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['x-receipt-id']).toBe('receipt-1');
    expect(receiptService.issueReceipt).toHaveBeenCalledWith('pay-1', 'user-caixa', {
      sendWhatsApp: false,
    });
  });

  it('POST /api/payments/:id/receipt › Should FAIL if payment does not exist', async () => {
    PaymentModel.findById.mockResolvedValue(null);

    const res = await request(app).post('/api/payments/pay-fantasma/receipt');

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/pagamento não encontrado/i);
    expect(receiptService.issueReceipt).not.toHaveBeenCalled();
  });

  it('POST /api/payments/:id/receipt › Should FAIL for a cancelled payment', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'cancelled',
    });

    const res = await request(app).post('/api/payments/pay-1/receipt');

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/cancelado/i);
    expect(receiptService.issueReceipt).not.toHaveBeenCalled();
  });

  it('POST /api/payments/:id/receipt › Should return 500 when the service fails', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'confirmed',
    });
    receiptService.issueReceipt.mockRejectedValue(new Error('PDF exploded'));

    const res = await request(app).post('/api/payments/pay-1/receipt');

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toMatch(/erro ao emitir recibo/i);
  });

  // --- LIST RECEIPTS (GET /:id/receipts) ---

  it('GET /api/payments/:id/receipts › Should list receipts of a payment', async () => {
    PaymentModel.findById.mockResolvedValue({ id: 'pay-1', status: 'confirmed' });
    ReceiptModel.findByPaymentId.mockResolvedValue([
      { id: 'r1', payment_id: 'pay-1', amount: 50, whatsapp_delivery_status: 'sent' },
      { id: 'r2', payment_id: 'pay-1', amount: 50, whatsapp_delivery_status: 'failed' },
    ]);

    const res = await request(app).get('/api/payments/pay-1/receipts');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(ReceiptModel.findByPaymentId).toHaveBeenCalledWith('pay-1');
  });

  it('GET /api/payments/:id/receipts › Should FAIL if payment does not exist', async () => {
    PaymentModel.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/payments/pay-fantasma/receipts');

    expect(res.statusCode).toBe(404);
    expect(ReceiptModel.findByPaymentId).not.toHaveBeenCalled();
  });
});

// =================================================================
// 3. UNIT TEST — MockPdfSignerService
// =================================================================
describe('MockPdfSignerService', () => {
  it('sign › Should stamp the input PDF and write a different output file', async () => {
    const PDFDocument = require('pdfkit');
    const MockPdfSignerService = require('../src/services/signing/MockPdfSignerService');

    const inputPath = path.join(os.tmpdir(), `mock_signer_input_${Date.now()}.pdf`);
    const outputPath = path.join(os.tmpdir(), `mock_signer_output_${Date.now()}.pdf`);

    try {
      // Create a tiny input PDF with pdfkit
      await new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(inputPath);
        doc.pipe(stream);
        doc.text('Teste');
        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      const signer = new MockPdfSignerService();
      await signer.sign(inputPath, outputPath, {});

      const inputBytes = fs.readFileSync(inputPath);
      const outputBytes = fs.readFileSync(outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(outputBytes.equals(inputBytes)).toBe(false);
      expect(outputBytes.length).toBeGreaterThan(0);
    } finally {
      for (const p of [inputPath, outputPath]) {
        try {
          fs.unlinkSync(p);
        } catch (_e) {
          // ignore cleanup errors
        }
      }
    }
  });
});
