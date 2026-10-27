jest.mock('../src/config/database', () => ({
  getConnection: jest.fn(),
  query: jest.fn(),
}));

const db = require('../src/config/database');
const RentalModel = require('../src/models/RentalModel');

const makeConnection = () => ({
  beginTransaction: jest.fn().mockResolvedValue(),
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
  release: jest.fn(),
  query: jest.fn(),
});

const installmentInserts = (conn) =>
  conn.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO installments'));

describe('RentalModel', () => {
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    conn = makeConnection();
    db.getConnection.mockResolvedValue(conn);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createTransaction', () => {
    it('creates the rental, reserves products and splits installments', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('FROM rental_items ri') && sql.includes('JOIN rentals')) return [[]];
        if (sql.includes('SELECT COALESCE(SUM(unit_price * quantity)')) {
          return [[{ total: '200.00' }]];
        }
        return [[]];
      });

      const result = await RentalModel.createTransaction({
        store_id: 'store-A',
        customer_id: 'customer-1',
        user_id: 'user-1',
        start_date: '2026-11-01',
        end_date_scheduled: '2026-11-05',
        status: 'reserved',
        discount: 20,
        penalty_fee: 10,
        items: [
          { product_id: 'prod-1', unit_price: 100, quantity: 1 },
          { product_id: 'prod-2', unit_price: 50, quantity: 2 },
        ],
        installments_config: { count: 3, first_due_date: '2026-11-10' },
      });

      expect(result.total_amount).toBe(190);

      const rentalInsert = conn.query.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO rentals'),
      );
      expect(rentalInsert[1][11]).toBe(190);
      expect(rentalInsert[1][12]).toBe(20);
      expect(rentalInsert[1][14]).toBe(10);

      const productUpdates = conn.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE products SET status = ?'),
      );
      expect(productUpdates).toHaveLength(2);
      expect(productUpdates[0][1]).toEqual(['reserved', 'prod-1']);
      expect(productUpdates[1][1]).toEqual(['reserved', 'prod-2']);

      const installments = installmentInserts(conn);
      expect(installments).toHaveLength(3);
      const totalInstallments = installments.reduce((sum, [, params]) => sum + params[4], 0);
      expect(totalInstallments).toBeCloseTo(190, 5);
      expect(installments[0][1][2]).toBe(1);
      expect(installments[1][1][2]).toBe(2);
      expect(installments[2][1][2]).toBe(3);
      expect(installments[0][1][3]).toBe(3);

      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('does not reserve products or create installments for a budget', async () => {
      conn.query.mockResolvedValue([[]]);

      await RentalModel.createTransaction({
        store_id: 'store-A',
        customer_id: 'customer-1',
        user_id: 'user-1',
        start_date: '2026-11-01',
        end_date_scheduled: '2026-11-05',
        status: 'budget',
        items: [{ product_id: 'prod-1', unit_price: 100, quantity: 1 }],
        installments_config: { count: 3, first_due_date: '2026-11-10' },
      });

      const productUpdates = conn.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE products SET status = ?'),
      );
      expect(productUpdates).toHaveLength(0);
      expect(installmentInserts(conn)).toHaveLength(0);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('rolls back when a product is already reserved in the period', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('FROM rental_items ri') && sql.includes('JOIN rentals')) {
          return [
            [
              {
                id: 'rental-existing',
                status: 'reserved',
                start_date: '2026-11-01',
                end_date_scheduled: '2026-11-05',
              },
            ],
          ];
        }
        if (sql.includes('SELECT name, code FROM products')) {
          return [[{ name: 'Vestido Azul', code: 'VEST-1' }]];
        }
        return [[]];
      });

      await expect(
        RentalModel.createTransaction({
          store_id: 'store-A',
          customer_id: 'customer-1',
          user_id: 'user-1',
          start_date: '2026-11-02',
          end_date_scheduled: '2026-11-04',
          status: 'reserved',
          items: [{ product_id: 'prod-1', unit_price: 100, quantity: 1 }],
        }),
      ).rejects.toThrow(/já está reservado\/retirado/);

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
    });

    it('rolls back when the installment count is invalid', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('FROM rental_items ri') && sql.includes('JOIN rentals')) return [[]];
        if (sql.includes('SELECT COALESCE(SUM(unit_price * quantity)')) {
          return [[{ total: '100.00' }]];
        }
        return [[]];
      });

      await expect(
        RentalModel.createTransaction({
          store_id: 'store-A',
          customer_id: 'customer-1',
          user_id: 'user-1',
          start_date: '2026-11-01',
          end_date_scheduled: '2026-11-05',
          status: 'reserved',
          items: [{ product_id: 'prod-1', unit_price: 100, quantity: 1 }],
          installments_config: { count: -1 },
        }),
      ).rejects.toThrow(/Número de parcelas/);

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('pickUp', () => {
    it('marks the rental as picked up and moves its products to rented', async () => {
      conn.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }]);

      await expect(RentalModel.pickUp('rental-1')).resolves.toBe(true);

      expect(conn.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("UPDATE rentals SET status = 'picked_up'"),
        ['rental-1'],
      );
      expect(conn.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("SET p.status = 'rented'"),
        ['rental-1'],
      );
      expect(conn.commit).toHaveBeenCalled();
    });

    it('rolls back when the rental status does not allow pickup', async () => {
      conn.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      await expect(RentalModel.pickUp('rental-1')).rejects.toThrow(/status não permite retirada/);

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('updateRental', () => {
    it('rebalances pending installments and syncs the penalty installment', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('FROM rentals WHERE id = ? FOR UPDATE')) {
          return [
            [
              {
                id: 'rental-1',
                status: 'reserved',
                start_date: '2026-11-01',
                end_date_scheduled: '2026-11-05',
                total_amount: '200.00',
                discount: '0.00',
                penalty_fee: '0.00',
              },
            ],
          ];
        }
        if (sql.includes('SELECT COALESCE(SUM(unit_price * quantity)')) {
          return [[{ total: '200.00' }]];
        }
        if (sql.includes('UPDATE rentals SET')) return [{ affectedRows: 1 }];
        if (sql.includes("status = 'pending' AND type = 'installment'")) {
          return [
            [
              { id: 'inst-1', value: '100.00' },
              { id: 'inst-2', value: '100.00' },
            ],
          ];
        }
        if (sql.includes('UPDATE installments SET value')) return [{ affectedRows: 1 }];
        if (sql.includes("type = 'penalty' AND status != 'cancelled'")) return [[]];
        if (sql.includes('INSERT INTO installments')) return [{ affectedRows: 1 }];
        throw new Error(`Unexpected query: ${sql}`);
      });

      await RentalModel.updateRental('rental-1', {
        discount: 20,
        notes: 'Ajuste',
        end_date_scheduled: '2026-11-06',
        status: 'reserved',
        penalty_fee: 30,
      });

      const rentalUpdate = conn.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE rentals SET'),
      );
      expect(rentalUpdate[1]).toEqual([
        20,
        'Ajuste',
        '2026-11-06',
        210,
        30,
        'reserved',
        'rental-1',
      ]);

      const installmentUpdates = conn.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE installments SET value'),
      );
      expect(installmentUpdates).toHaveLength(2);
      expect(installmentUpdates[0][1]).toEqual([90, 'inst-1']);
      expect(installmentUpdates[1][1]).toEqual([90, 'inst-2']);

      const penaltyInsert = installmentInserts(conn)[0];
      expect(penaltyInsert[1][2]).toBe(30);
      expect(conn.commit).toHaveBeenCalled();
    });
  });

  describe('extendRental', () => {
    it('extends the end date and distributes the extra amount across pending installments', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('FROM rentals WHERE id = ? FOR UPDATE')) {
          return [
            [
              {
                id: 'rental-1',
                status: 'picked_up',
                start_date: '2026-11-01',
                end_date_scheduled: '2026-11-05',
                total_amount: '200.00',
              },
            ],
          ];
        }
        if (sql.includes('UPDATE rentals SET end_date_scheduled')) {
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("status = 'pending' AND type = 'installment'")) {
          return [
            [
              { id: 'inst-1', value: '100.00' },
              { id: 'inst-2', value: '100.00' },
            ],
          ];
        }
        if (sql.includes('UPDATE installments SET value')) return [{ affectedRows: 1 }];
        throw new Error(`Unexpected query: ${sql}`);
      });

      await RentalModel.extendRental('rental-1', '2026-11-10', 100);

      const rentalUpdate = conn.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE rentals SET end_date_scheduled'),
      );
      expect(rentalUpdate[1]).toEqual(['2026-11-10', 100, 'rental-1']);

      const installmentUpdates = conn.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE installments SET value'),
      );
      expect(installmentUpdates[0][1]).toEqual([150, 'inst-1']);
      expect(installmentUpdates[1][1]).toEqual([150, 'inst-2']);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('rejects extending a rental that was already returned', async () => {
      conn.query.mockResolvedValueOnce([
        [
          {
            id: 'rental-1',
            status: 'returned',
            start_date: '2026-11-01',
            end_date_scheduled: '2026-11-05',
            total_amount: '200.00',
          },
        ],
      ]);

      await expect(RentalModel.extendRental('rental-1', '2026-11-10', 100)).rejects.toThrow(
        /Não é possível prorrogar/,
      );

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('returnRental', () => {
    it('calculates the late penalty, sends products to maintenance and creates the penalty installment', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-10T12:00:00.000Z'));

      conn.query.mockImplementation((sql) => {
        if (sql.includes('FROM rentals WHERE id = ? AND status NOT IN')) {
          return [
            [
              {
                id: 'rental-1',
                status: 'picked_up',
                start_date: '2026-11-01T00:00:00.000Z',
                end_date_scheduled: '2026-11-08T00:00:00.000Z',
                total_amount: '200.00',
                discount: '20.00',
                penalty_fee: '0.00',
              },
            ],
          ];
        }
        if (sql.includes('SELECT product_id FROM rental_items')) {
          return [[{ product_id: 'prod-1' }, { product_id: 'prod-2' }]];
        }
        if (sql.includes('UPDATE products SET status = ?')) return [{ affectedRows: 1 }];
        if (sql.includes('SELECT COALESCE(SUM(unit_price * quantity)')) {
          return [[{ total: '200.00' }]];
        }
        if (sql.includes('UPDATE rentals SET status')) return [{ affectedRows: 1 }];
        if (sql.includes("type = 'penalty' AND status != 'cancelled'")) return [[]];
        if (sql.includes('INSERT INTO installments')) return [{ affectedRows: 1 }];
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await RentalModel.returnRental('rental-1');

      expect(result.penaltyFee).toBeCloseTo(8.5714, 4);

      const productUpdates = conn.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE products SET status = ?'),
      );
      expect(productUpdates).toHaveLength(2);
      expect(productUpdates[0][1][0]).toBe('maintenance');

      const rentalUpdate = conn.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE rentals SET status'),
      );
      expect(rentalUpdate[1][0]).toBeCloseTo(8.5714, 4);
      expect(rentalUpdate[1][1]).toBeCloseTo(188.5714, 4);

      const penaltyInsert = installmentInserts(conn)[0];
      expect(penaltyInsert[1][2]).toBeCloseTo(8.5714, 4);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('makes products available immediately and updates an existing penalty installment', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('FROM rentals WHERE id = ? AND status NOT IN')) {
          return [
            [
              {
                id: 'rental-1',
                status: 'picked_up',
                start_date: '2026-11-01',
                end_date_scheduled: '2026-11-20',
                total_amount: '200.00',
                discount: '0.00',
                penalty_fee: '0.00',
              },
            ],
          ];
        }
        if (sql.includes('SELECT product_id FROM rental_items')) {
          return [[{ product_id: 'prod-1' }]];
        }
        if (sql.includes('UPDATE products SET status = ?')) return [{ affectedRows: 1 }];
        if (sql.includes('SELECT COALESCE(SUM(unit_price * quantity)')) {
          return [[{ total: '200.00' }]];
        }
        if (sql.includes('UPDATE rentals SET status')) return [{ affectedRows: 1 }];
        if (sql.includes("type = 'penalty' AND status != 'cancelled'")) {
          return [[{ id: 'penalty-1' }]];
        }
        if (sql.includes('UPDATE installments SET value')) return [{ affectedRows: 1 }];
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await RentalModel.returnRental('rental-1', 25, true);

      expect(result.penaltyFee).toBe(25);

      const productUpdate = conn.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE products SET status = ?'),
      );
      expect(productUpdate[1]).toEqual(['available', 'prod-1']);

      const penaltyUpdate = conn.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE installments SET value'),
      );
      expect(penaltyUpdate[1]).toEqual([25, 'penalty-1']);
      expect(installmentInserts(conn)).toHaveLength(0);
    });

    it('rolls back when the rental is already returned or cancelled', async () => {
      conn.query.mockResolvedValueOnce([[]]);

      await expect(RentalModel.returnRental('rental-1')).rejects.toThrow(
        /já finalizado\/cancelado/,
      );

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('cancelRental and deleteRental', () => {
    it('cancels the rental and releases its products', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('SELECT product_id FROM rental_items')) {
          return [[{ product_id: 'prod-1' }, { product_id: 'prod-2' }]];
        }
        if (sql.includes('UPDATE products SET status')) return [{ affectedRows: 1 }];
        if (sql.includes('UPDATE rentals SET status')) return [{ affectedRows: 1 }];
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(RentalModel.cancelRental('rental-1')).resolves.toBe(true);

      const productUpdates = conn.query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE products SET status'),
      );
      expect(productUpdates).toHaveLength(2);
      expect(productUpdates[0][1]).toEqual(['prod-1']);

      const rentalUpdate = conn.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE rentals SET status'),
      );
      expect(rentalUpdate[0]).toContain("status = 'cancelled'");
      expect(conn.commit).toHaveBeenCalled();
    });

    it('deletes a cancelled rental and its related records', async () => {
      conn.query.mockImplementation((sql) => {
        if (sql.includes('SELECT id, status FROM rentals WHERE id = ? FOR UPDATE')) {
          return [[{ id: 'rental-1', status: 'cancelled' }]];
        }
        if (sql.includes('DELETE FROM')) return [{ affectedRows: 1 }];
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(RentalModel.deleteRental('rental-1')).resolves.toBe(true);

      const deletes = conn.query.mock.calls.filter(([sql]) => sql.includes('DELETE FROM'));
      expect(deletes).toHaveLength(3);
      expect(conn.commit).toHaveBeenCalled();
    });

    it('does not delete a rental that is not cancelled', async () => {
      conn.query.mockResolvedValueOnce([[{ id: 'rental-1', status: 'reserved' }]]);

      await expect(RentalModel.deleteRental('rental-1')).rejects.toThrow(/Apenas itens cancelados/);

      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });
});
