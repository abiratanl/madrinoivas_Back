const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// 1. R2 Client Configuration
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.AWS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getPublicUrl = (key) => {
  if (!key) return null;
  const publicUrlBase = process.env.AWS_URL.replace(/\/$/, '');
  return `${publicUrlBase}/${key.replace(/^\/+/, '')}`;
};

// Extracts an R2 object key from either a raw key/path or a public URL.
// Returns null for legacy data URLs and external URLs.
const extractKey = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('data:')) return null;

  const publicUrlBase = process.env.AWS_URL.replace(/\/$/, '');
  if (value.startsWith(`${publicUrlBase}/`)) {
    return value.slice(publicUrlBase.length + 1);
  }

  if (/^https?:\/\//i.test(value)) return null;

  return value.replace(/^\/+/, '');
};

/**
 * Uploads a buffer to Cloudflare R2 and returns the stored object key (path).
 * @param {Buffer} buffer - File contents
 * @param {String} key - Object key, e.g. 'stores/signatures/file.png'
 * @param {String} contentType - MIME type of the file
 * @returns {String} - Object key stored in the database
 */
const uploadBuffer = async (buffer, key, contentType = 'application/octet-stream') => {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return key;
  } catch (error) {
    console.error('Error in upload Service:', error);
    throw new Error('Failed to communicate with storage server.');
  }
};

/**
 * Uploads a file to Cloudflare R2
 * @param {Object} file - File object from Multer (req.file)
 * @param {String} folder - Virtual folder for organization (e.g., 'products', 'avatars')
 * @returns {String} - Public image URL
 */
const uploadImage = async (file, folder = 'uploads') => {
  // 2. Generate unique name to avoid overwriting (hash + timestamp + extension)
  const fileExtension = file.originalname.split('.').pop();
  const randomName = crypto.randomBytes(16).toString('hex');
  const fileName = `${folder}/${Date.now()}-${randomName}.${fileExtension}`;

  const key = await uploadBuffer(file.buffer, fileName, file.mimetype);
  return getPublicUrl(key);
};

/**
 * Downloads an object from R2 by its stored key.
 * @param {String} key - Object key stored in the database
 * @returns {Buffer}
 */
const downloadFile = async (key) => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: key.replace(/^\/+/, ''),
    }),
  );

  return Buffer.from(await response.Body.transformToByteArray());
};

/**
 * Deletes an object from R2 by its stored key. Ignores missing objects.
 * @param {String} key - Object key stored in the database
 */
const deleteFile = async (key) => {
  if (!key) return;

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET,
        Key: key.replace(/^\/+/, ''),
      }),
    );
  } catch (error) {
    console.error('Error deleting file from R2:', error);
  }
};

module.exports = {
  uploadBuffer,
  uploadImage,
  downloadFile,
  deleteFile,
  getPublicUrl,
  extractKey,
};
