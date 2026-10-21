const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

/**
 * Sends a document (e.g. a signed receipt PDF) to a WhatsApp number.
 *
 * Two gateway modes are supported, selected by environment variables:
 *
 * 1. Evolution API style (WHATSAPP_INSTANCE_NAME set):
 *      POST {WHATSAPP_API_URL}/message/sendMedia/{instance}
 *      Header: apikey: {WHATSAPP_API_TOKEN}
 *      JSON body with the file encoded as base64.
 *
 * 2. Generic multipart gateway (WHATSAPP_INSTANCE_NAME empty):
 *      POST {WHATSAPP_API_URL}
 *      Header: Authorization: Bearer {WHATSAPP_API_TOKEN}
 *      multipart/form-data with fields: phone, caption, document.
 *
 * Safeguards:
 * - WHATSAPP_ENABLED !== 'true' -> the call is skipped (logged) and the
 *   function returns false, so the receipt is recorded as 'failed' instead of
 *   pretending a delivery that never happened.
 * - WHATSAPP_TEST_NUMBER (only honored when NODE_ENV !== 'production')
 *   redirects every message to the given test number.
 * - Failures never throw: a WhatsApp outage must not break the receipt flow.
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone (any format; digits are kept and
 *   the Brazilian country code '55' is prefixed when missing)
 * @param {string} params.filePath - Absolute path of the file to send
 * @param {string} params.fileName - File name shown to the recipient
 * @param {string} [params.caption] - Message caption sent with the document
 * @returns {Promise<boolean>} true on success (or when disabled), false on failure
 */
exports.sendDocument = async ({ to, filePath, fileName, caption = '' }) => {
  // Normalize phone: digits only, prefix '55' (Brazil) when missing
  let phone = String(to || '').replace(/\D/g, '');
  if (!phone) {
    console.error('WhatsApp send skipped: empty recipient phone number.');
    return false;
  }
  if (!phone.startsWith('55')) {
    phone = `55${phone}`;
  }

  // Test redirect: outside production, force delivery to the test number
  if (process.env.NODE_ENV !== 'production' && process.env.WHATSAPP_TEST_NUMBER) {
    const testNumber = String(process.env.WHATSAPP_TEST_NUMBER).replace(/\D/g, '');
    console.log(`WhatsApp test redirect: ${phone} -> ${testNumber}`);
    phone = testNumber;
  }

  if (process.env.WHATSAPP_ENABLED !== 'true') {
    console.error(
      `WhatsApp disabled (WHATSAPP_ENABLED != 'true'). Receipt NOT sent to ${phone}. ` +
        'Set WHATSAPP_ENABLED=true and configure WHATSAPP_API_URL/WHATSAPP_API_TOKEN to enable delivery.',
    );
    return false;
  }

  try {
    if (process.env.WHATSAPP_INSTANCE_NAME) {
      await sendViaEvolutionApi({ phone, filePath, fileName, caption });
    } else {
      await sendViaMultipartGateway({ phone, filePath, fileName, caption });
    }

    console.log('WhatsApp document sent to %s', phone);
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp document:', error.message);
    return false;
  }
};

/**
 * Evolution API: POST /message/sendMedia/{instance} with base64 media.
 */
async function sendViaEvolutionApi({ phone, filePath, fileName, caption }) {
  const baseUrl = process.env.WHATSAPP_API_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/message/sendMedia/${process.env.WHATSAPP_INSTANCE_NAME}`;
  const media = fs.readFileSync(filePath).toString('base64');

  await axios.post(
    url,
    {
      number: phone,
      mediatype: 'document',
      mimetype: 'application/pdf',
      fileName,
      caption,
      media,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.WHATSAPP_API_TOKEN,
      },
    },
  );
}

/**
 * Generic gateway: multipart/form-data upload with Bearer token.
 */
async function sendViaMultipartGateway({ phone, filePath, fileName, caption }) {
  const form = new FormData();
  form.append('phone', phone);
  form.append('caption', caption);
  form.append('document', fs.createReadStream(filePath), fileName);

  await axios.post(process.env.WHATSAPP_API_URL, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}
