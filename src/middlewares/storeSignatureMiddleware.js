const crypto = require('crypto');
const sharp = require('sharp');
const upload = require('../config/multer');
const { uploadBuffer } = require('../services/uploadService');

const parseJsonArrayField = (value) => {
  if (typeof value !== 'string') return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
};

const normalizeMultipartFields = (req) => {
  if (!req.body) req.body = {};

  req.body.addresses = parseJsonArrayField(req.body.addresses);
  req.body.contacts = parseJsonArrayField(req.body.contacts);
};

/**
 * Parses the multipart payload sent by the store form.
 * JSON requests pass through untouched, so Swagger/API clients keep working.
 */
const uploadStoreSignature = (req, res, next) => {
  upload.single('owner_signature')(req, res, (error) => {
    if (!error) return next();

    const isFileSizeError = error.code === 'LIMIT_FILE_SIZE';
    return res.status(400).json({
      status: 'fail',
      message: isFileSizeError
        ? 'A assinatura deve ter no máximo 5MB.'
        : 'Envie um arquivo de imagem válido para a assinatura.',
    });
  });
};

/**
 * Normalizes array fields and sends the owner signature to R2.
 * Only the object key (path) is persisted in the database.
 */
const processStoreSignature = async (req, res, next) => {
  normalizeMultipartFields(req);

  if (!req.file) return next();

  try {
    const buffer = await sharp(req.file.buffer).rotate().png().toBuffer();
    const filename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.png`;
    const key = `stores/signatures/${filename}`;

    req.body.owner_signature = await uploadBuffer(buffer, key, 'image/png');
    next();
  } catch (error) {
    console.error('Erro ao processar assinatura da loja:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Falha ao enviar a assinatura para o armazenamento.',
    });
  }
};

module.exports = {
  uploadStoreSignature,
  processStoreSignature,
};
