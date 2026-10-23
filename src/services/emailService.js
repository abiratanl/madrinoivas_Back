const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true para 465, false para outras portas (geralmente starttls)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Ajuda em alguns servidores compartilhados que dão erro de certificado
  },
});

/**
 * Envia um e-mail genérico
 * @param {string} to - Destinatário
 * @param {string} subject - Assunto
 * @param {string} text - Corpo em texto puro
 * @param {string} html - (Opcional) Corpo em HTML
 * @param {Array} [attachments] - (Opcional) Anexos no formato do nodemailer
 *   (ex.: { filename, path } ou { filename, content })
 */
exports.sendEmail = async ({ to, subject, text, html, attachments }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM, // Ex: '"Tech-S" <no-reply@techs.com>'
      to,
      subject,
      text,
      html: html || text, // Se não tiver HTML, usa o texto
      attachments,
    });

    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    // Não lançamos o erro (throw) para não travar o cadastro do usuário caso o email falhe,
    // mas retornamos false para o controller saber.
    return false;
  }
};
