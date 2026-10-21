const MockPdfSignerService = require('./MockPdfSignerService');

/**
 * Signing factory: selects the PDF signer implementation via the
 * PDF_SIGNER environment variable. This is the ONLY supported way to swap
 * signers — services must consume the exported singleton.
 *
 * PDF_SIGNER=mock (default) -> MockPdfSignerService (dev/test only)
 * PDF_SIGNER=a1             -> A1PdfSignerService (reserved, not implemented yet)
 */
function createSigner() {
  const signer = process.env.PDF_SIGNER || 'mock';

  switch (signer) {
    case 'mock':
      return new MockPdfSignerService();
    case 'a1':
      throw new Error(
        'PDF_SIGNER=a1 is reserved but A1PdfSignerService is not implemented yet. ' +
          'See src/services/signing/PdfSignerService.js for implementation guidance.',
      );
    default:
      throw new Error(`Unknown PDF_SIGNER value: "${signer}". Expected "mock" or "a1".`);
  }
}

module.exports = createSigner();
