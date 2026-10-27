const {
  isGlobalRole,
  isLocalManager,
  getUserStoreId,
  resolveStoreId,
  canAccessStore,
  requireStoreScope,
} = require('../src/middlewares/storeScopeMiddleware');

describe('storeScopeMiddleware', () => {
  it('classifies global and local manager roles', () => {
    expect(isGlobalRole({ role: 'admin' })).toBe(true);
    expect(isGlobalRole({ role: 'owner' })).toBe(true);
    expect(isGlobalRole({ role: 'local_manager' })).toBe(false);
    expect(isLocalManager({ role: 'local_manager' })).toBe(true);
    expect(isLocalManager({ role: 'gerente_local' })).toBe(true);
    expect(isLocalManager({ role: 'attendant' })).toBe(false);
  });

  it('reads the store id from token or database field names', () => {
    expect(getUserStoreId({ storeId: 'store-A' })).toBe('store-A');
    expect(getUserStoreId({ store_id: 'store-B' })).toBe('store-B');
    expect(getUserStoreId({})).toBeNull();
  });

  it('ignores requested store ids for scoped users', () => {
    expect(resolveStoreId({ role: 'local_manager', storeId: 'store-A' }, 'store-B')).toBe(
      'store-A',
    );
    expect(resolveStoreId({ role: 'admin', storeId: 'store-A' }, 'store-B')).toBe('store-B');
    expect(resolveStoreId({ role: 'admin' })).toBeNull();
  });

  it('limits local managers to their own store', () => {
    const localManager = { role: 'local_manager', storeId: 'store-A' };

    expect(canAccessStore(localManager, 'store-A')).toBe(true);
    expect(canAccessStore(localManager, 'store-B')).toBe(false);
    expect(canAccessStore(localManager, null)).toBe(false);
  });

  it('allows global users and rejects scoped users without a store', () => {
    expect(canAccessStore({ role: 'owner' }, 'store-B')).toBe(true);
    expect(canAccessStore({ role: 'attendant' }, 'store-A')).toBe(false);
  });

  it('keeps legacy records without store id accessible to attendants', () => {
    expect(canAccessStore({ role: 'attendant', storeId: 'store-A' }, null)).toBe(true);
    expect(canAccessStore({ role: 'attendant', storeId: 'store-A' }, 'store-B')).toBe(false);
  });

  it('adds store scope to the request for scoped users', () => {
    const req = { user: { role: 'local_manager', storeId: 'store-A' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    requireStoreScope(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.storeScope).toEqual({ isGlobal: false, storeId: 'store-A' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks scoped users without a store', () => {
    const req = { user: { role: 'attendant' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    requireStoreScope(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Usuário sem loja vinculada. Contate o administrador.',
    });
  });
});
