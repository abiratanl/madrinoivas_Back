const fs = require('fs');
const PdfSignerService = require('./PdfSignerService');

/**
 * Mock signer for development/testing.
 * Copies the unsigned PDF unchanged to the output path so generated documents
 * carry no test watermark. It has NO cryptographic validity — a real A1
 * signer must replace it in production (see PdfSignerService.js).
 */
class MockPdfSignerService extends PdfSignerService {
  async sign(inputPath, outputPath, _metadata = {}) {
    await fs.promises.copyFile(inputPath, outputPath);
  }
}

module.exports = MockPdfSignerService;
