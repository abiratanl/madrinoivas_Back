const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

const db = require('../src/config/database');
const app = require('../src/app');

const JWT_SECRET = 'dashboard-test-secret';

const tokenFor = (role, storeId = null) =>
  jwt.sign({ id: 'user-1', email: 'user@test.com', role, storeId }, JWT_SECRET);

const currentMonth = new Date().toISOString().slice(0, 7);

const buildQueryResult = (sql, params = []) => {
  const query = sql.replace(/\s+/g, ' ');

  if (query.includes('AS current_month')) {
    return [[{ total: '12500.50', current_month: '3200.75', previous: '10000.00' }]];
  }

  if (query.includes("DATE_FORMAT(p.paid_at, '%Y-%m') AS month")) {
    return [[{ month: currentMonth, revenue: '3200.75' }]];
  }

  if (query.includes('p.paid_at >= CURDATE()') && query.includes("p.status = 'confirmed'")) {
    return [
      [
        { payment_method: 'pix', count: 2, total: '350.00' },
        { payment_method: 'cash', count: 1, total: '120.00' },
      ],
    ];
  }

  if (query.includes('GROUP BY p.payment_method')) {
    return [[{ payment_method: 'pix', count: 4, total: '2400.00' }]];
  }

  if (
    query.includes("DATE_FORMAT(i.due_date, '%Y-%m') AS month") &&
    query.includes('GROUP BY month')
  ) {
    return [[{ month: currentMonth, count: 3, total: '900.00' }]];
  }

  if (query.includes('AS overdue_total') && query.includes('AS pending_total')) {
    return [
      [
        {
          overdue_total: '450.00',
          overdue_count: 2,
          pending_total: '1200.00',
          pending_count: 3,
        },
      ],
    ];
  }

  if (query.includes('AS is_overdue') && query.includes('c.name AS customer_name')) {
    return [
      [
        {
          id: 'installment-1',
          rental_id: 'rental-1',
          number: 1,
          total_installments: 3,
          value: '500.00',
          amount_paid: '100.00',
          balance: '400.00',
          due_date: '2026-10-20',
          status: 'pending',
          is_overdue: 1,
          customer_id: 'customer-1',
          customer_name: 'Maria',
          rental_status: 'reserved',
          start_date: '2026-10-28T10:00:00.000Z',
          end_date_scheduled: '2026-10-30T10:00:00.000Z',
        },
      ],
    ];
  }

  if (query.includes('FROM installments i')) {
    return [[{ overdue_amount: '450.00', overdue_installments: 2 }]];
  }

  if (query.includes('AS pending')) {
    return [[{ pending: '1800.00' }]];
  }

  if (query.includes('FROM stores s') && query.includes('AS total_rentals')) {
    return [
      [
        {
          id: 'store-A',
          name: 'Loja A',
          is_active: 1,
          city: 'Taubaté',
          state: 'SP',
          total_rentals: 10,
          active_rentals: 3,
          revenue: '5000.00',
          contracted_value: '20000.00',
          total_products: 25,
          active_products: 20,
          occupied_products: 10,
          items_rented: 14,
          total_customers: 8,
        },
      ],
    ];
  }

  if (query.includes('FROM stores s') && query.includes('WHERE s.id = ?')) {
    if (params[0] === 'missing-store') return [[]];

    return [
      [
        {
          id: params[0],
          name: 'Loja A',
          cnpj: '12.345.678/0001-90',
          is_active: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          city: 'Taubaté',
          state: 'SP',
        },
      ],
    ];
  }

  if (query.includes('FROM stores') && query.includes('SUM(is_active = 1)')) {
    return [[{ total: 2, active: 2 }]];
  }

  if (query.includes("SUM(status = 'available')")) {
    return [
      [
        {
          total: 25,
          available: 18,
          reserved: 2,
          rented: 5,
          laundry: 0,
          maintenance: 0,
          transferring: 0,
          discarded: 0,
        },
      ],
    ];
  }

  if (query.includes('SELECT COUNT(*) AS total FROM products')) {
    return [[{ total: 40 }]];
  }

  if (query.includes('FROM customers WHERE deleted_at IS NULL')) {
    return [[{ total: 15 }]];
  }

  if (query.includes('COUNT(DISTINCT customer_id)')) {
    return [[{ total: 8 }]];
  }

  if (query.includes('FROM rentals') && query.includes('GROUP BY status')) {
    return [
      [
        { status: 'reserved', count: 2 },
        { status: 'picked_up', count: 1 },
        { status: 'late', count: 1 },
      ],
    ];
  }

  if (query.includes('FROM rentals') && query.includes('AS active')) {
    return [[{ total: 10, active: 4, contracted_revenue: '30000.00' }]];
  }

  if (query.includes('JOIN collections c')) {
    return [
      [
        {
          id: 'collection-1',
          name: 'Noivas 2026',
          store_name: 'Loja A',
          rentals: 4,
          revenue: '6200.00',
        },
      ],
    ];
  }

  if (query.includes('FROM rental_items ri')) {
    return [
      [
        {
          id: 'product-1',
          code: 'VEST-001',
          name: 'Vestido Noiva',
          store_name: 'Loja A',
          rentals: 3,
          revenue: '4500.00',
        },
      ],
    ];
  }

  if (query.includes('GROUP BY t.status')) {
    return [
      [
        { status: 'active', count: 2 },
        { status: 'completed', count: 3 },
      ],
    ];
  }

  if (query.includes('AS direction')) {
    return [
      [
        {
          id: 'transfer-in',
          product_id: 'product-1',
          status: 'active',
          requested_at: '2026-10-20T10:00:00.000Z',
          from_store_id: 'store-B',
          to_store_id: 'store-A',
          product_name: 'Vestido Noiva',
          product_code: 'VEST-001',
          from_store_name: 'Loja B',
          to_store_name: 'Loja A',
          requested_by_name: 'Gerente B',
          direction: 'incoming',
        },
        {
          id: 'transfer-out',
          product_id: 'product-2',
          status: 'active',
          requested_at: '2026-10-19T10:00:00.000Z',
          from_store_id: 'store-A',
          to_store_id: 'store-B',
          product_name: 'Vestido Festa',
          product_code: 'VEST-002',
          from_store_name: 'Loja A',
          to_store_name: 'Loja B',
          requested_by_name: 'Gerente A',
          direction: 'outgoing',
        },
      ],
    ];
  }

  if (query.includes('COUNT(*) AS total') && query.includes('FROM product_transfers t')) {
    return [[{ total: 3 }]];
  }

  if (query.includes('from_store_name') && query.includes('GROUP BY t.from_store_id')) {
    return [
      [
        {
          from_store_id: 'store-A',
          from_store_name: 'Loja A',
          to_store_id: 'store-B',
          to_store_name: 'Loja B',
          count: 2,
        },
      ],
    ];
  }

  if (query.includes("'fitting' AS event_type")) {
    return [
      [
        {
          id: 'rental-week-fitting',
          status: 'reserved',
          total_amount: '1500.00',
          customer_name: 'Maria',
          event_type: 'fitting',
          event_date: '2026-10-27T14:00:00.000Z',
        },
        {
          id: 'rental-week-pickup',
          status: 'reserved',
          total_amount: '1500.00',
          customer_name: 'Maria',
          event_type: 'pickup',
          event_date: '2026-10-28T10:00:00.000Z',
        },
      ],
    ];
  }

  if (query.includes('AS lifetime_revenue')) {
    return [
      [
        {
          id: 'product-1',
          code: 'VEST-001',
          name: 'Vestido Noiva',
          store_name: 'Loja A',
          purchase_price: '1000.00',
          status: 'available',
          lifetime_revenue: '2500.00',
          last_rental_at: '2026-07-01T10:00:00.000Z',
          days_without_rental: 117,
        },
        {
          id: 'product-2',
          code: 'VEST-002',
          name: 'Vestido Festa',
          store_name: 'Loja A',
          purchase_price: '800.00',
          status: 'available',
          lifetime_revenue: '100.00',
          last_rental_at: null,
          days_without_rental: 200,
        },
      ],
    ];
  }

  if (query.includes("p.status IN ('laundry', 'maintenance')")) {
    return [
      [
        {
          id: 'product-maintenance',
          code: 'VEST-003',
          name: 'Vestido em Ajuste',
          status: 'maintenance',
          updated_at: '2026-10-20T10:00:00.000Z',
        },
      ],
    ];
  }

  if (query.includes('UNION ALL')) {
    return [
      [
        {
          id: 'rental-today-pickup',
          status: 'reserved',
          total_amount: '1500.00',
          customer_name: 'Maria',
          event_type: 'pickup',
          event_date: '2026-10-26T10:00:00.000Z',
        },
        {
          id: 'rental-today-return',
          status: 'late',
          total_amount: '900.00',
          customer_name: 'Ana',
          event_type: 'return',
          event_date: '2026-10-26T17:00:00.000Z',
        },
      ],
    ];
  }

  if (query.includes('AS event_type')) {
    return [
      [
        {
          id: 'rental-upcoming',
          status: 'reserved',
          total_amount: '1500.00',
          customer_name: 'Maria',
          event_type: 'pickup',
          event_date: '2026-10-28T10:00:00.000Z',
        },
      ],
    ];
  }

  if (query.includes('ORDER BY r.created_at DESC')) {
    return [
      [
        {
          id: 'rental-1',
          status: 'reserved',
          total_amount: '1500.00',
          start_date: '2026-10-28T10:00:00.000Z',
          end_date_scheduled: '2026-10-30T10:00:00.000Z',
          created_at: '2026-10-20T10:00:00.000Z',
          customer_name: 'Maria',
          store_name: 'Loja A',
        },
      ],
    ];
  }

  return [[]];
};

describe('Dashboard API', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    db.query.mockImplementation((sql, params) => Promise.resolve(buildQueryResult(sql, params)));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/dashboard/general › should return the general dashboard for an owner', async () => {
    const res = await request(app)
      .get('/api/dashboard/general')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.summary.total_revenue).toBe(12500.5);
    expect(res.body.data.summary.total_stores).toBe(2);
    expect(res.body.data.rentals_by_status).toHaveLength(6);
    expect(res.body.data.stores).toHaveLength(1);
    expect(res.body.data.comparison.previous_revenue).toBeNull();
    expect(res.body.data.comparison.growth_percentage).toBeNull();
    expect(res.body.data.summary.delinquency_rate).toBe(25);
    expect(res.body.data.summary.average_ticket).toBe(3000);
    expect(res.body.data.summary.contracted_revenue).toBe(30000);
    expect(res.body.data.receivables_forecast).toHaveLength(6);
    expect(res.body.data.receivables_forecast[0]).toEqual({
      month: currentMonth,
      total: 900,
      count: 3,
    });
    expect(res.body.data.stores[0].average_ticket).toBe(2000);
    expect(res.body.data.stores[0].contracted_value).toBe(20000);
    expect(res.body.data.stores[0].occupancy_rate).toBe(50);
    expect(res.body.data.stores[0].turnover_rate).toBe(0.7);
    expect(res.body.data.top_collections[0].name).toBe('Noivas 2026');
    expect(res.body.data.transfers).toMatchObject({
      total: 5,
      in_transit: 2,
      completed: 3,
      cancelled: 0,
    });
    expect(res.body.data.inventory.paid_off_count).toBe(1);
    expect(res.body.data.inventory.stale_count).toBe(2);
    expect(db.query.mock.calls.some(([sql]) => sql.includes('WHERE s.is_active = 1'))).toBe(true);
  });

  it('GET /api/dashboard/general › should apply the requested period filter', async () => {
    const res = await request(app)
      .get('/api/dashboard/general?period=current_month')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.period).toBe('current_month');
    expect(res.body.data.comparison).toEqual({
      previous_revenue: 10000,
      growth_percentage: 25.01,
    });
    expect(
      db.query.mock.calls.some(([sql]) =>
        sql.includes("p.paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"),
      ),
    ).toBe(true);
  });

  it('GET /api/dashboard/general › should fall back to all for an unknown period', async () => {
    const res = await request(app)
      .get('/api/dashboard/general?period=invalid')
      .set('Authorization', `Bearer ${tokenFor('owner')}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.period).toBe('all');
  });

  it('GET /api/dashboard/general › should return 403 for a local manager', async () => {
    const res = await request(app)
      .get('/api/dashboard/general')
      .set('Authorization', `Bearer ${tokenFor('local_manager', 'store-A')}`);

    expect(res.statusCode).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('GET /api/dashboard/local/:storeId › should allow a manager to access their own store', async () => {
    const res = await request(app)
      .get('/api/dashboard/local/store-A')
      .set('Authorization', `Bearer ${tokenFor('local_manager', 'store-A')}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.store.id).toBe('store-A');
    expect(res.body.data.summary.active_rentals).toBe(4);
    expect(res.body.data.summary.late_rentals).toBe(1);
    expect(res.body.data.summary.average_ticket).toBe(3000);
    expect(res.body.data.summary.delinquency_rate).toBe(25);
    expect(res.body.data.upcoming_rentals).toHaveLength(1);
    expect(res.body.data.today_operations).toHaveLength(2);
    expect(res.body.data.today_operations[0].event_type).toBe('pickup');
    expect(res.body.data.today_receipts.total).toBe(470);
    expect(res.body.data.today_receipts.by_method).toHaveLength(2);
    expect(res.body.data.week_operations).toHaveLength(2);
    expect(res.body.data.week_operations[0].event_type).toBe('fitting');
    expect(res.body.data.availability).toEqual({
      total: 25,
      available: 18,
      reserved: 2,
      rented: 5,
      laundry: 0,
      maintenance: 0,
      transferring: 0,
      discarded: 0,
      active: 25,
      occupancy_rate: 28,
    });
    expect(res.body.data.receivables).toMatchObject({
      overdue_total: 450,
      overdue_count: 2,
      pending_total: 1200,
      pending_count: 3,
    });
    expect(res.body.data.receivables.items).toHaveLength(1);
    expect(res.body.data.receivables.items[0].is_overdue).toBe(true);
    expect(res.body.data.transfers).toMatchObject({
      in_transit_incoming: 1,
      in_transit_outgoing: 1,
      completed_in_period: 3,
    });
    expect(res.body.data.maintenance).toMatchObject({
      total: 1,
      laundry: 0,
      maintenance: 1,
    });
  });

  it('GET /api/dashboard/local/:storeId › should return 403 for a manager of another store', async () => {
    const res = await request(app)
      .get('/api/dashboard/local/store-A')
      .set('Authorization', `Bearer ${tokenFor('local_manager', 'store-B')}`);

    expect(res.statusCode).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('GET /api/dashboard/local/:storeId › should allow an admin to access any store', async () => {
    const res = await request(app)
      .get('/api/dashboard/local/store-B')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.store.id).toBe('store-B');
  });

  it('GET /api/dashboard/local/:storeId › should return 404 when the store does not exist', async () => {
    const res = await request(app)
      .get('/api/dashboard/local/missing-store')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toContain('Loja não encontrada');
  });
});
