const crypto = require('crypto'); // Built-in Node module
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const User = require('../models/UserModel'); // Import User Model for 'create' logic
const emailService = require('../services/emailService');


/**
 * Helper function to generate JWT Token
 * UPDATED: Now includes 'storeId' in the payload so the frontend knows the context.
 */
const signToken = (id, email, role, storeId) => {
  return jwt.sign(
    { id, email, role, storeId }, // Payload
    process.env.JWT_SECRET, 
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

/**
 * @desc    Register a new user (Admin, Owner, Attendant, or Client)
 * @route   POST /api/auth/register
 * @access  Public (or Protected if creating admins)
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password, store_id, role } = req.body;

    // 1. Validation or Security checks can go here
    // e.g., if (role === 'admin' && !req.user.isAdmin) return error...

    // 2. Create User using the Model (which handles hashing and UUIDs)
    const newUser = await User.create({
      name,
      email,
      password,
      store_id: store_id || null, // Ensure null if empty
      role: role || 'customer'
    });

    // 3. Generate Token (Optional: auto-login after register)
    const token = signToken(newUser.id, newUser.email, newUser.role, newUser.store_id);

    res.status(201).json({
      status: 'success',
      message: 'User created successfully',
      token,
      data: {
        user: newUser
      }
    });

  } catch (error) {
    // Handle Duplicate Email
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'Email already in use.' });
    }
    // Handle Invalid Store ID
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ status: 'error', message: 'Invalid Store ID provided.' });
    }
    console.error('Register Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

/**
 * @desc    User Login
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide Email and Password',
      });
    }

    // 2. Check if user exists
    // We select * so 'store_id' is included automatically
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid Email or Password',
      });
    }

    // 3. Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        status: 'error',
        message: 'Your account is inactive. Please contact the administrator.',
      });
    }

    // 4. Check if password is correct
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid Email or Password',
      });
    }

    // =================================================================
    // 🔍 INTEGRITY CHECK: STORE CONSISTENCY
    // If user is 'attendant' (staff) but has no store assigned, warn or block.
    // =================================================================
    if (user.role === 'attendant' && !user.store_id) {
       console.warn(`[Auth Warning] Staff user ${user.id} has no Store ID assigned.`);
       // Optional: Block login if strict mode is desired
       // return res.status(403).json({ status: 'error', message: 'Staff account configuration error.' });
    }

    // =================================================================
    //                🛑 TOLL: REQUIRING PASSWORD CHANGE
    // =================================================================
    if (user.must_change_password) {
      // Pass store_id to temp token as well
      const tempToken = signToken(user.id, user.email, user.role, user.store_id);

      return res.status(403).json({
        status: 'fail',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password on first login.',
        token: tempToken,
      });
    }
    // =================================================================

    // 5. If everything ok, send token to client
    // UPDATED: Passing user.store_id to the token generator
    const token = signToken(user.id, user.email, user.role, user.store_id);

    // Remove password from output (security)
    user.password = undefined;

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user, // This object now includes 'store_id'
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
  }
};

/**
 * @desc    Forgot Password - Generate token and mock email sending
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Please provide a valid Email.' });
    }

    // 1. Check if user exists
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      // Security: Do not reveal if user exists or not
      return res.status(200).json({
        status: 'success',
        message: 'Token sent to email (if user exists).',
      });
    }

    // 2. Generate Random Token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // 3. Hash the token to save in DB
    const passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // 4. Save to Database using MySQL Time (DATE_ADD)
    await db.query(
      `UPDATE users 
       SET password_reset_token = ?, 
           password_reset_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE) 
       WHERE email = ?`,
      [passwordResetToken, email],
    );

    // 5. Email Sending
    const resetURL = `${req.protocol}://${req.get('host')}/api/auth/reset-password/${resetToken}`;
    const message = `
    Olá, ${user.name}.

    Recebemos uma solicitação para redefinir sua senha de acesso.
    
    Se você estiver usando o sistema via Navegador/App, clique no link abaixo:
    ${resetURL}

    Se você precisa inserir o código manualmente (caso de teste), seu token é:
    ${resetToken}

    (Este link é válido por apenas 10 minutos).
    
    Se você não solicitou essa alteração, por favor ignore este e-mail.
  `;
    
    await emailService.sendEmail({
      to: user.email,
      subject: 'Recuperação de Senha (Válido por 10 min)',
      text: message
    });

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

/**
 * @desc    Reset Password - Set new password using valid token
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
  try {
    // 1. Receber dados
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ message: 'Por favor, informe a nova senha.' });
    }

    // 2. Hashear o token recebido (CRUCIAL: O banco guarda o hash, não o token puro)
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // 3. Buscar usuário (Delegamos a query para o Model)
    const user = await User.findByResetToken(hashedToken);

    if (!user) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'O token é inválido ou expirou.' 
      });
    }

    // 4. Criptografar a nova senha
    // Usamos custo 12 para manter padrão com o userController
    const newPasswordHash = await bcrypt.hash(password, 12);

    // 5. Salvar no banco e limpar tokens (Delegamos para o Model)
    await User.updatePasswordAfterReset(user.id, newPasswordHash);

    res.status(200).json({
      status: 'success',
      message: 'Senha alterada com sucesso! Faça login com a nova senha.',
    });

  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno ao redefinir senha.' });
  }
};

/**
 * @desc    Change password (can be used on first login or in profile)
 * @route   POST /api/auth/change-password
 * @access  Private (Requires Token)
 */
exports.changePassword = async (req, res) => {
  try {
    // 1. We retrieved the current password and the new password from the body.
    const { currentPassword, newPassword } = req.body;

    // 2. The ID comes from the JWT Token (thanks to the 'protect' middleware).
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide current and new password.' });
    }

    // 3. We searched for the user in the database to check their current password.
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // 4. Check if the "Current Password" matches the one on file with the bank.
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    // 5. Encrypt the NEW password
    const newHash = await bcrypt.hash(newPassword, 10);

    // 6. Update the database and remove the must_change_password flag.
    await db.query('UPDATE users SET password = ?, must_change_password = FALSE WHERE id = ?', [
      newHash,
      userId,
    ]);

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully!',
    });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};