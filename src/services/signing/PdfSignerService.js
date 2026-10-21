/**
 * Strategy pattern for PDF signing.
 *
 * All signers extend this base class and implement the same contract:
 *   sign(inputPath, outputPath, metadata) -> Promise<void>
 * which reads the unsigned PDF from inputPath and writes the signed PDF to
 * outputPath. `metadata` carries contextual data (receiptId, paymentId,
 * issuedBy, ...) that implementations may embed in the signature.
 *
 * Implementations:
 * - MockPdfSignerService: development/testing only. Stamps a visible
 *   "MOCK" watermark on the last page using pdf-lib. No cryptographic
 *   validity.
 * - A1PdfSignerService (future): real ICP-Brasil A1 certificate signing.
 *   Implement it with node-signpdf + a PKCS#12 (.pfx) certificate loaded
 *   from env vars (e.g. A1_CERT_PATH / A1_CERT_PASSWORD). It must keep this
 *   exact same interface.
 *
 * Swapping implementations is done ONLY via the PDF_SIGNER environment
 * variable, resolved by the factory in ./index.js. Never instantiate a
 * signer directly outside this directory.
 */
class PdfSignerService {
  // eslint-disable-next-line no-unused-vars
  async sign(inputPath, outputPath, metadata = {}) {
    throw new Error('PdfSignerService.sign() not implemented');
  }
}

module.exports = PdfSignerService;
