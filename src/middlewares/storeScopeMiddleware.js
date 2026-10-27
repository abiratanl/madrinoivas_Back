const GLOBAL_ROLES = ['admin', 'owner', 'proprietario'];
const LOCAL_MANAGER_ROLES = ['local_manager', 'gerente_local'];

const normalizeRole = (role) => String(role || '').toLowerCase();

const isGlobalRole = (user) => GLOBAL_ROLES.includes(normalizeRole(user?.role));

const isLocalManager = (user) => LOCAL_MANAGER_ROLES.includes(normalizeRole(user?.role));

const getUserStoreId = (user) => user?.storeId || user?.store_id || null;

/**
 * Resolves the store id that must be used in a query.
 * Global roles may optionally filter by a requested store; scoped roles always
 * use their own store, ignoring any store id sent by the client.
 */
const resolveStoreId = (user, requestedStoreId) => {
  if (isGlobalRole(user)) {
    return requestedStoreId || null;
  }
  return getUserStoreId(user);
};

/**
 * Checks whether a user can access a resource that belongs to `storeId`.
 * Local managers are strictly limited to their own store. For other scoped
 * roles, legacy records without a store id are still allowed (backward
 * compatibility) while records with a store id are compared.
 */
const canAccessStore = (user, storeId) => {
  if (isGlobalRole(user)) return true;

  const userStoreId = getUserStoreId(user);
  if (!userStoreId) return false;

  if (storeId === undefined || storeId === null) {
    return !isLocalManager(user);
  }

  return String(userStoreId) === String(storeId);
};

/**
 * Middleware that guarantees a non-global user has a store linked before
 * reaching store-scoped controllers.
 */
const requireStoreScope = (req, res, next) => {
  if (isGlobalRole(req.user)) {
    req.storeScope = { isGlobal: true, storeId: null };
    return next();
  }

  const storeId = getUserStoreId(req.user);
  if (!storeId) {
    return res.status(403).json({
      status: 'error',
      message: 'Usuário sem loja vinculada. Contate o administrador.',
    });
  }

  req.storeScope = { isGlobal: false, storeId };
  return next();
};

module.exports = {
  isGlobalRole,
  isLocalManager,
  getUserStoreId,
  resolveStoreId,
  canAccessStore,
  requireStoreScope,
};
