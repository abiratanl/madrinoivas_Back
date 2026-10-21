const fs = require('fs');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const PdfSignerService = require('./PdfSignerService');

/**
 * Mock signer for development/testing.
 * Loads the input PDF with pdf-lib and draws a rotated, semi-transparent
 * "Assinado Digitalmente - MOCK" stamp on the last page, then writes the
 * result to outputPath. It has NO cryptographic validity — a real A1
 * signer must replace it in production (see PdfSignerService.js).
 */
class MockPdfSignerService extends PdfSignerService {
  async sign(inputPath, outputPath, _metadata = {}) {
    const inputBytes = await fs.promises.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(inputBytes);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    const text = 'Assinado Digitalmente - MOCK / DADOS DE TESTE';
    const fontSize = 24;
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    lastPage.drawText(text, {
      x: (width - textWidth * Math.cos(Math.PI / 4)) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(0.6, 0.1, 0.1),
      opacity: 0.35,
      rotate: degrees(45),
    });

    const signedBytes = await pdfDoc.save();
    await fs.promises.writeFile(outputPath, signedBytes);
  }
}

module.exports = MockPdfSignerService;
