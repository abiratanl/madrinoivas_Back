const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const whatsappService = require('../src/services/whatsappService');

jest.mock('axios');

describe('WhatsAppService.sendDocument', () => {
  const originalEnv = { ...process.env };
  let tempFile;

  beforeEach(() => {
    tempFile = path.join(os.tmpdir(), `whatsapp_test_${Date.now()}.pdf`);
    fs.writeFileSync(tempFile, 'fake-pdf-content');
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_API_URL = 'https://whatsapp.example.com';
    process.env.WHATSAPP_API_TOKEN = 'secret-token';
    delete process.env.WHATSAPP_INSTANCE_NAME;
    delete process.env.WHATSAPP_TEST_NUMBER;
    axios.post.mockResolvedValue({ status: 201 });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    fs.rmSync(tempFile, { force: true });
  });

  it('normalizes the phone number (digits only, prefixes 55)', async () => {
    process.env.WHATSAPP_INSTANCE_NAME = 'madri';

    const sent = await whatsappService.sendDocument({
      to: '(12) 99745-6608',
      filePath: tempFile,
      fileName: 'recibo.pdf',
    });

    expect(sent).toBe(true);
    const [, body] = axios.post.mock.calls[0];
    expect(body.number).toBe('5512997456608');
  });

  it('redirects to WHATSAPP_TEST_NUMBER outside production', async () => {
    process.env.WHATSAPP_INSTANCE_NAME = 'madri';
    process.env.WHATSAPP_TEST_NUMBER = '5512997456608';

    await whatsappService.sendDocument({
      to: '5511987654321',
      filePath: tempFile,
      fileName: 'recibo.pdf',
    });

    const [, body] = axios.post.mock.calls[0];
    expect(body.number).toBe('5512997456608');
  });

  it('does not redirect to WHATSAPP_TEST_NUMBER in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_INSTANCE_NAME = 'madri';
    process.env.WHATSAPP_TEST_NUMBER = '5512997456608';

    await whatsappService.sendDocument({
      to: '5511987654321',
      filePath: tempFile,
      fileName: 'recibo.pdf',
    });

    const [, body] = axios.post.mock.calls[0];
    expect(body.number).toBe('5511987654321');
  });

  it('skips the HTTP call and reports failure when WHATSAPP_ENABLED is not "true"', async () => {
    process.env.WHATSAPP_ENABLED = 'false';

    const sent = await whatsappService.sendDocument({
      to: '5512997456608',
      filePath: tempFile,
      fileName: 'recibo.pdf',
    });

    expect(sent).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('uses the Evolution API endpoint when WHATSAPP_INSTANCE_NAME is set', async () => {
    process.env.WHATSAPP_INSTANCE_NAME = 'madri';

    const sent = await whatsappService.sendDocument({
      to: '5512997456608',
      filePath: tempFile,
      fileName: 'recibo.pdf',
      caption: 'Seu recibo',
    });

    expect(sent).toBe(true);
    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://whatsapp.example.com/message/sendMedia/madri');
    expect(config.headers.apikey).toBe('secret-token');
    expect(body).toMatchObject({
      number: '5512997456608',
      mediatype: 'document',
      mimetype: 'application/pdf',
      fileName: 'recibo.pdf',
      caption: 'Seu recibo',
      media: Buffer.from('fake-pdf-content').toString('base64'),
    });
  });

  it('returns false (without throwing) when the gateway fails', async () => {
    axios.post.mockRejectedValue(new Error('gateway down'));

    const sent = await whatsappService.sendDocument({
      to: '5512997456608',
      filePath: tempFile,
      fileName: 'recibo.pdf',
    });

    expect(sent).toBe(false);
  });

  it('returns false for an empty recipient', async () => {
    const sent = await whatsappService.sendDocument({
      to: '',
      filePath: tempFile,
      fileName: 'recibo.pdf',
    });

    expect(sent).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
