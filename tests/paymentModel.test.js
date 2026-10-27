jest.mock('../src/config/database', () => ({
  getConnection: jest.fn(),
  query: jest.fn(),
}));

const db = require('../src/config/database');
const PaymentModel = require('../src/models/PaymentModel');

const makeConnection = () => ({
  beginTransaction: jest.fn().mockResolvedValue(),
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
  release: jest.fn(),
  query: jest.fn(),
});

describe('PaymentModel', () => {
  let conn;

  beforeEach(() => {
    jest.clearAllMocks();
    conn = makeConnection();
    db.getConnection.mockResolvedValue(conn);
  });

  it('creates a payment without installment and commits', async () => {
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    const result = await PaymentModel.create({
      rental_id: 'rental-1',
      user_id: 'user-1',
      amount: 100,
      payment_method: 'pix',
    });

    expect(result.id).toEqual(expect.any(String));
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query.mock.calls[0][0]).toContain('INSERT INTO payments');
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('marks an installment as partially paid when the payment does not cover it', async () => {
    conn.query.mockImplementation((sql) => {
      if (sql.includes('INSERT INTO payments')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT * FROM installments WHERE id = ? FOR UPDATE')) {
        return [
          [
            {
              id: 'inst-1',
              amount_paid: '40.00',
              value: '100.00',
              status: 'pending',
              paid_at: null,
            },
          ],
        ];
      }
      if (sql.includes('UPDATE installments')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    });

    await PaymentModel.create({
      rental_id: 'rental-1',
      installment_id: 'inst-1',
      user_id: 'user-1',
      amount: 50,
      payment_method: 'pix',
      type: 'installment',
    });

    const installmentUpdate = conn.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE installments'),
    );
    expect(installmentUpdate[1]).toEqual([90, 'partially_paid', null, 'inst-1']);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('marks an installment as paid and stamps paid_at when fully covered', async () => {
    conn.query.mockImplementation((sql) => {
      if (sql.includes('INSERT INTO payments')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT * FROM installments WHERE id = ? FOR UPDATE')) {
        return [
          [
            {
              id: 'inst-1',
              amount_paid: '40.00',
              value: '100.00',
              status: 'pending',
              paid_at: null,
            },
          ],
        ];
      }
      if (sql.includes('UPDATE installments')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    });

    await PaymentModel.create({
      rental_id: 'rental-1',
      installment_id: 'inst-1',
      user_id: 'user-1',
      amount: 60,
      payment_method: 'pix',
      type: 'installment',
    });

    const installmentUpdate = conn.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE installments'),
    );
    expect(installmentUpdate[1][0]).toBe(100);
    expect(installmentUpdate[1][1]).toBe('paid');
    expect(installmentUpdate[1][2]).toBeInstanceOf(Date);
    expect(installmentUpdate[1][3]).toBe('inst-1');
  });

  it('rolls back when the payment insert fails', async () => {
    conn.query.mockRejectedValue(new Error('database unavailable'));

    await expect(
      PaymentModel.create({
        rental_id: 'rental-1',
        user_id: 'user-1',
        amount: 100,
        payment_method: 'pix',
      }),
    ).rejects.toThrow('database unavailable');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('reverts the old installment and applies the new one when editing a payment', async () => {
    conn.query.mockImplementation((sql, params) => {
      if (sql.includes('SELECT * FROM installments WHERE id = ? FOR UPDATE')) {
        if (params[0] === 'inst-old') {
          return [
            [
              {
                id: 'inst-old',
                amount_paid: '100.00',
                value: '100.00',
                status: 'paid',
                paid_at: new Date('2026-01-01T00:00:00.000Z'),
              },
            ],
          ];
        }
        return [
          [
            {
              id: 'inst-new',
              amount_paid: '0.00',
              value: '100.00',
              status: 'pending',
              paid_at: null,
            },
          ],
        ];
      }
      if (sql.includes('UPDATE installments')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE payments SET')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    });

    const oldPayment = { id: 'pay-1', installment_id: 'inst-old', amount: '50.00' };
    await PaymentModel.update('pay-1', { amount: 80, installment_id: 'inst-new' }, oldPayment);

    const installmentUpdates = conn.query.mock.calls.filter(([sql]) =>
      sql.includes('UPDATE installments'),
    );
    expect(installmentUpdates).toHaveLength(2);
    expect(installmentUpdates[0][1]).toEqual([50, 'partially_paid', null, 'inst-old']);
    expect(installmentUpdates[1][1]).toEqual([80, 'partially_paid', null, 'inst-new']);

    const paymentUpdate = conn.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE payments SET'),
    );
    expect(paymentUpdate[1]).toEqual([80, 'inst-new', 'pay-1']);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('reverts the linked installment when cancelling a payment', async () => {
    conn.query.mockImplementation((sql) => {
      if (sql.includes('SELECT * FROM payments WHERE id = ? FOR UPDATE')) {
        return [
          [
            {
              id: 'pay-1',
              installment_id: 'inst-1',
              amount: '40.00',
              status: 'confirmed',
            },
          ],
        ];
      }
      if (sql.includes('SELECT * FROM installments WHERE id = ? FOR UPDATE')) {
        return [
          [
            {
              id: 'inst-1',
              amount_paid: '40.00',
              value: '100.00',
              status: 'partially_paid',
              paid_at: null,
            },
          ],
        ];
      }
      if (sql.includes('UPDATE installments')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE payments')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(PaymentModel.cancel('pay-1', 'user-1', 'duplicado')).resolves.toBe(true);

    const installmentUpdate = conn.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE installments'),
    );
    expect(installmentUpdate[1]).toEqual([0, 'pending', null, 'inst-1']);

    const paymentUpdate = conn.query.mock.calls.find(([sql]) => sql.includes('UPDATE payments'));
    expect(paymentUpdate[1]).toEqual(['user-1', 'duplicado', 'pay-1']);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('rejects cancelling an already cancelled payment and rolls back', async () => {
    conn.query.mockImplementation((sql) => {
      if (sql.includes('SELECT * FROM payments WHERE id = ? FOR UPDATE')) {
        return [[{ id: 'pay-1', status: 'cancelled' }]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(PaymentModel.cancel('pay-1', 'user-1', 'duplicado')).rejects.toThrow(
      'PAYMENT_ALREADY_CANCELLED',
    );

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('returns null when cancelling a missing payment', async () => {
    conn.query.mockResolvedValue([[]]);

    await expect(PaymentModel.cancel('missing', 'user-1', 'teste')).resolves.toBeNull();

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('sums confirmed payments for a rental', async () => {
    db.query.mockResolvedValue([[{ total_paid: '123.45' }]]);

    await expect(PaymentModel.getTotalPaidByRentalId('rental-1')).resolves.toBe(123.45);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status != 'cancelled'"), [
      'rental-1',
    ]);
  });
});
