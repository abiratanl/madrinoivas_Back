const jwt = require('jsonwebtoken');

/**
 * Middleware to protect routes.
 * Verifies the JWT token from the 'Authorization' header.
 */
exports.protect = (req, res, next) => {
  // 1. Get token from header
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. Check if token exists
  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Você não está logado! Por favor faça log in.',
    });
  }

  // 3. Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Attach user info to the request object
    req.user = decoded;

    next();
  } catch (_error) {
    return res.status(401).json({
      status: 'error',
      message: 'Senha ou Email inválido, por favor tente novamente.',
    });
  }
};

/**
 * Middleware to restrict access based on user roles (RBAC).
 * @param  {...String} roles - List of allowed roles
 * Supports both English (admin, owner, attendant, customer) 
 * and Portuguese (admin, proprietario, atendente, cliente) role names.
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // req.user is set in the 'protect' middleware
    const userRole = req.user.role;
    
    // Normalize role names to support both English and Portuguese
    const roleMap = {
      'admin': ['admin'],
      'owner': ['owner', 'proprietario'],
      'attendant': ['attendant', 'atendente'],
      'customer': ['customer', 'cliente'],
    };
    
    // Check if user's role matches any of the allowed roles (considering aliases)
    const hasPermission = roles.some(allowedRole => {
      const aliases = roleMap[allowedRole] || [allowedRole];
      return aliases.includes(userRole);
    });
    
    if (!hasPermission) {
      return res.status(403).json({
        status: 'error',
        message: 'Você não tem permissão para efetuar esta operação!',
      });
    }
    next();
  };
};
