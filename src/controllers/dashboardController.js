const db = require('../config/database');

const RENTAL_STATUSES = ['budget', 'reserved', 'picked_up', 'returned', 'late', 'cancelled'];
const REVENUE_MONTHS = 6;
const DEFAULT_PERIOD = 'all';

const PERIOD_START_SQL = {
  current_month: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
  last_3_months: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 MONTH), '%Y-%m-01')",
  last_6_months: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')",
  current_year: "DATE_FORMAT(CURDATE(), '%Y-01-01')",
};

const PERIOD_MONTHS = {
  current_month: 1,
  last_3_months: 3,
  last_6_months: 6,
  current_year: 12,
  all: REVENUE_MONTHS,
};

const PERIOD_COMPARISON = {
  current_month: {
    previousStart: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')",
    previousEnd: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
  },
  last_3_months: {
    previousStart: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')",
    previousEnd: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 MONTH), '%Y-%m-01')",
  },
  last_6_months: {
    previousStart: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m-01')",
    previousEnd: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')",
  },
  current_year: {
    previousStart: "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 YEAR), '%Y-01-01')",
    previousEnd: "DATE_FORMAT(CURDATE(), '%Y-01-01')",
  },
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBoolean = (value) => value === true || value === 1 || value === '1';

const roundTwo = (value) => Math.round(value * 100) / 100;

const normalizePeriod = (period) => {
  if (period === 'all' || Object.prototype.hasOwnProperty.call(PERIOD_START_SQL, period)) {
    return period;
  }

  return DEFAULT_PERIOD;
};

const buildPeriodFilter = (column, period) => {
  const startExpression = PERIOD_START_SQL[normalizePeriod(period)];
  return startExpression ? `AND ${column} >= ${startExpression}` : '';
};

const getPeriodMonths = (period) => PERIOD_MONTHS[normalizePeriod(period)] || REVENUE_MONTHS;

const lastMonthKeys = (months = REVENUE_MONTHS) => {
  const now = new Date();
  const keys = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    keys.push(`${date.getFullYear()}-${month}`);
  }

  return keys;
};

const nextMonthKeys = (months = 6) => {
  const now = new Date();
  const keys = [];

  for (let offset = 0; offset < months; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    keys.push(`${date.getFullYear()}-${month}`);
  }

  return keys;
};

const formatStatusBreakdown = (rows) => {
  const counts = new Map(rows.map((row) => [row.status, toNumber(row.count)]));

  return RENTAL_STATUSES.map((status) => ({
    status,
    count: counts.get(status) || 0,
  }));
};

const formatRevenueByMonth = (rows, months = REVENUE_MONTHS) => {
  const revenueByMonth = new Map(rows.map((row) => [row.month, toNumber(row.revenue)]));

  return lastMonthKeys(months).map((month) => ({
    month,
    revenue: revenueByMonth.get(month) || 0,
  }));
};

const getRevenueTotals = async (storeId, period) => {
  const normalizedPeriod = normalizePeriod(period);
  const comparisonRange = PERIOD_COMPARISON[normalizedPeriod];
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const periodFilter = buildPeriodFilter('p.paid_at', normalizedPeriod);
  const previousSelect = comparisonRange
    ? `,
       COALESCE(
         SUM(
           CASE
             WHEN p.paid_at >= ${comparisonRange.previousStart}
               AND p.paid_at < ${comparisonRange.previousEnd}
             THEN p.amount
             ELSE 0
           END
         ),
         0
       ) AS previous`
    : `,
       NULL AS previous`;
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(p.amount), 0) AS total,
       COALESCE(
         SUM(
           CASE
             WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
             THEN p.amount
             ELSE 0
           END
         ),
         0
       ) AS current_month
       ${previousSelect}
     FROM payments p
     JOIN rentals r ON r.id = p.rental_id
     WHERE p.status = 'confirmed' ${storeFilter} ${periodFilter}`,
    params,
  );

  const totalRevenue = toNumber(rows[0]?.total);
  const previousRevenue = comparisonRange ? toNumber(rows[0]?.previous) : null;
  const growthPercentage =
    previousRevenue !== null && previousRevenue > 0
      ? roundTwo(((totalRevenue - previousRevenue) / previousRevenue) * 100)
      : null;

  return {
    total_revenue: totalRevenue,
    revenue_current_month: toNumber(rows[0]?.current_month),
    previous_revenue: previousRevenue,
    growth_percentage: growthPercentage,
  };
};

const getRentalCounts = async (storeId, period) => {
  const storeFilter = storeId ? 'AND store_id = ?' : '';
  const periodFilter = buildPeriodFilter('created_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(status <> 'cancelled'), 0) AS total,
       COALESCE(SUM(status IN ('reserved', 'picked_up', 'late')), 0) AS active
     FROM rentals
     WHERE 1 = 1 ${storeFilter} ${periodFilter}`,
    params,
  );

  return {
    total_rentals: toNumber(rows[0]?.total),
    active_rentals: toNumber(rows[0]?.active),
  };
};

const getRentalStatusBreakdown = async (storeId, period) => {
  const storeFilter = storeId ? 'AND store_id = ?' : '';
  const periodFilter = buildPeriodFilter('created_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT status, COUNT(*) AS count
     FROM rentals
     WHERE 1 = 1 ${storeFilter} ${periodFilter}
     GROUP BY status`,
    params,
  );

  return formatStatusBreakdown(rows);
};

const getPendingReceivables = async (storeId, period) => {
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const periodFilter = buildPeriodFilter('r.created_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(GREATEST(r.total_amount - COALESCE(paid.total_paid, 0), 0)), 0) AS pending
     FROM rentals r
     LEFT JOIN (
       SELECT rental_id, SUM(amount) AS total_paid
       FROM payments
       WHERE status = 'confirmed'
       GROUP BY rental_id
     ) paid ON paid.rental_id = r.id
     WHERE r.status NOT IN ('budget', 'cancelled') ${storeFilter} ${periodFilter}`,
    params,
  );

  return toNumber(rows[0]?.pending);
};

const getOverdueReceivables = async (storeId, period) => {
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const periodFilter = buildPeriodFilter('r.created_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       COALESCE(SUM(GREATEST(i.value - i.amount_paid, 0)), 0) AS overdue_amount,
       COUNT(*) AS overdue_installments
     FROM installments i
     JOIN rentals r ON r.id = i.rental_id
     WHERE i.status IN ('pending', 'partially_paid', 'overdue')
       AND i.due_date < CURDATE()
       AND r.status <> 'cancelled' ${storeFilter} ${periodFilter}`,
    params,
  );

  return {
    overdue_receivables: toNumber(rows[0]?.overdue_amount),
    overdue_installments: toNumber(rows[0]?.overdue_installments),
  };
};

const getReceivablesForecast = async (storeId, months = 6) => {
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(i.due_date, '%Y-%m') AS month,
       COUNT(*) AS count,
       COALESCE(SUM(GREATEST(i.value - i.amount_paid, 0)), 0) AS total
     FROM installments i
     JOIN rentals r ON r.id = i.rental_id
     WHERE i.status IN ('pending', 'partially_paid', 'overdue')
       AND r.status <> 'cancelled'
       AND i.due_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
       AND i.due_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ${months} MONTH)
       ${storeFilter}
     GROUP BY month
     ORDER BY month ASC`,
    params,
  );

  const forecast = new Map(
    rows.map((row) => [
      row.month,
      {
        total: toNumber(row.total),
        count: toNumber(row.count),
      },
    ]),
  );

  return nextMonthKeys(months).map((month) => ({
    month,
    total: forecast.get(month)?.total || 0,
    count: forecast.get(month)?.count || 0,
  }));
};

const getRevenueByMonth = async (storeId, period) => {
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const params = storeId ? [storeId] : [];
  const months = getPeriodMonths(period);

  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(p.paid_at, '%Y-%m') AS month,
       COALESCE(SUM(p.amount), 0) AS revenue
     FROM payments p
     JOIN rentals r ON r.id = p.rental_id
     WHERE p.status = 'confirmed'
       AND p.paid_at >= DATE_FORMAT(
         DATE_SUB(CURDATE(), INTERVAL ${months - 1} MONTH),
         '%Y-%m-01'
       )
       ${storeFilter}
     GROUP BY month
     ORDER BY month ASC`,
    params,
  );

  return formatRevenueByMonth(rows, months);
};

const getPaymentsByMethod = async (storeId, period) => {
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const periodFilter = buildPeriodFilter('p.paid_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       p.payment_method,
       COUNT(*) AS count,
       COALESCE(SUM(p.amount), 0) AS total
     FROM payments p
     JOIN rentals r ON r.id = p.rental_id
     WHERE p.status = 'confirmed' ${storeFilter} ${periodFilter}
     GROUP BY p.payment_method
     ORDER BY total DESC`,
    params,
  );

  return rows.map((row) => ({
    payment_method: row.payment_method,
    count: toNumber(row.count),
    total: toNumber(row.total),
  }));
};

const getTodayReceipts = async (storeId) => {
  const [rows] = await db.query(
    `SELECT
       p.payment_method,
       COUNT(*) AS count,
       COALESCE(SUM(p.amount), 0) AS total
     FROM payments p
     JOIN rentals r ON r.id = p.rental_id
     WHERE p.status = 'confirmed'
       AND r.store_id = ?
       AND p.paid_at >= CURDATE()
       AND p.paid_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
     GROUP BY p.payment_method
     ORDER BY total DESC`,
    [storeId],
  );

  const byMethod = rows.map((row) => ({
    payment_method: row.payment_method,
    count: toNumber(row.count),
    total: toNumber(row.total),
  }));

  return {
    total: byMethod.reduce((sum, method) => sum + method.total, 0),
    count: byMethod.reduce((sum, method) => sum + method.count, 0),
    by_method: byMethod,
  };
};

const getStoreCounts = async () => {
  const [rows] = await db.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(is_active = 1), 0) AS active
     FROM stores`,
  );

  return {
    total_stores: toNumber(rows[0]?.total),
    active_stores: toNumber(rows[0]?.active),
  };
};

const getCustomerCount = async () => {
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM customers WHERE deleted_at IS NULL');

  return toNumber(rows[0]?.total);
};

const getStoreCustomerCount = async (storeId, period) => {
  const periodFilter = buildPeriodFilter('created_at', period);

  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT customer_id) AS total
     FROM rentals
     WHERE store_id = ? AND status <> 'cancelled' ${periodFilter}`,
    [storeId],
  );

  return toNumber(rows[0]?.total);
};

const getProductCount = async () => {
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM products');
  return toNumber(rows[0]?.total);
};

const getStoreProductCounts = async (storeId) => {
  const [rows] = await db.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(status = 'available'), 0) AS available,
       COALESCE(SUM(status = 'reserved'), 0) AS reserved,
       COALESCE(SUM(status = 'rented'), 0) AS rented,
       COALESCE(SUM(status = 'laundry'), 0) AS laundry,
       COALESCE(SUM(status = 'maintenance'), 0) AS maintenance,
       COALESCE(SUM(status = 'transferring'), 0) AS transferring,
       COALESCE(SUM(status = 'discarded'), 0) AS discarded
     FROM products
     WHERE store_id = ?`,
    [storeId],
  );

  const totalProducts = toNumber(rows[0]?.total);
  const availableProducts = toNumber(rows[0]?.available);
  const reservedProducts = toNumber(rows[0]?.reserved);
  const rentedProducts = toNumber(rows[0]?.rented);
  const laundryProducts = toNumber(rows[0]?.laundry);
  const maintenanceProducts = toNumber(rows[0]?.maintenance);
  const transferringProducts = toNumber(rows[0]?.transferring);
  const discardedProducts = toNumber(rows[0]?.discarded);
  const activeProducts =
    availableProducts + reservedProducts + rentedProducts + laundryProducts + maintenanceProducts;

  return {
    total_products: totalProducts,
    available_products: availableProducts,
    reserved_products: reservedProducts,
    rented_products: rentedProducts,
    laundry_products: laundryProducts,
    maintenance_products: maintenanceProducts,
    transferring_products: transferringProducts,
    discarded_products: discardedProducts,
    active_products: activeProducts,
    occupancy_rate:
      activeProducts > 0
        ? roundTwo(((reservedProducts + rentedProducts) / activeProducts) * 100)
        : 0,
  };
};

const getStorePerformance = async (period) => {
  const rentalPeriodFilter = buildPeriodFilter('r.created_at', period);
  const paymentPeriodFilter = buildPeriodFilter('p.paid_at', period);

  const [rows] = await db.query(
    `SELECT
       s.id,
       s.name,
       s.is_active,
       (
         SELECT a.city
         FROM addresses a
         WHERE a.store_id = s.id
         ORDER BY a.is_default DESC, a.created_at ASC
         LIMIT 1
       ) AS city,
       (
         SELECT a.state
         FROM addresses a
         WHERE a.store_id = s.id
         ORDER BY a.is_default DESC, a.created_at ASC
         LIMIT 1
       ) AS state,
       (
         SELECT COUNT(*)
         FROM rentals r
         WHERE r.store_id = s.id AND r.status <> 'cancelled' ${rentalPeriodFilter}
       ) AS total_rentals,
       (
         SELECT COUNT(*)
         FROM rentals r
         WHERE r.store_id = s.id AND r.status IN ('reserved', 'picked_up', 'late')
         ${rentalPeriodFilter}
       ) AS active_rentals,
       (
         SELECT COALESCE(SUM(p.amount), 0)
         FROM payments p
         JOIN rentals r ON r.id = p.rental_id
         WHERE r.store_id = s.id AND p.status = 'confirmed' ${paymentPeriodFilter}
       ) AS revenue,
       (
         SELECT COUNT(*)
         FROM products pr
         WHERE pr.store_id = s.id
       ) AS total_products,
       (
         SELECT COUNT(*)
         FROM products pr
         WHERE pr.store_id = s.id AND pr.status <> 'discarded'
       ) AS active_products,
       (
         SELECT COUNT(*)
         FROM products pr
         WHERE pr.store_id = s.id AND pr.status IN ('reserved', 'rented')
       ) AS occupied_products,
       (
         SELECT COALESCE(SUM(ri.quantity), 0)
         FROM rental_items ri
         JOIN rentals r ON r.id = ri.rental_id
         WHERE r.store_id = s.id
           AND r.status NOT IN ('budget', 'cancelled')
           ${rentalPeriodFilter}
       ) AS items_rented,
       (
         SELECT COUNT(DISTINCT r.customer_id)
         FROM rentals r
         WHERE r.store_id = s.id AND r.status <> 'cancelled' ${rentalPeriodFilter}
       ) AS total_customers
     FROM stores s
     ORDER BY s.name ASC`,
  );

  return rows.map((row) => {
    const totalRentals = toNumber(row.total_rentals);
    const revenue = toNumber(row.revenue);
    const activeProducts = toNumber(row.active_products);
    const occupiedProducts = toNumber(row.occupied_products);
    const itemsRented = toNumber(row.items_rented);

    return {
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
      is_active: toBoolean(row.is_active),
      total_rentals: totalRentals,
      active_rentals: toNumber(row.active_rentals),
      revenue,
      average_ticket: totalRentals > 0 ? revenue / totalRentals : 0,
      total_products: toNumber(row.total_products),
      active_products: activeProducts,
      occupied_products: occupiedProducts,
      occupancy_rate: activeProducts > 0 ? roundTwo((occupiedProducts / activeProducts) * 100) : 0,
      items_rented: itemsRented,
      turnover_rate: activeProducts > 0 ? itemsRented / activeProducts : 0,
      total_customers: toNumber(row.total_customers),
    };
  });
};

const getTopProducts = async (storeId, period) => {
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const periodFilter = buildPeriodFilter('r.created_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       p.id,
       p.code,
       p.name,
       s.name AS store_name,
       COALESCE(SUM(ri.quantity), 0) AS rentals,
       COALESCE(SUM(ri.quantity * ri.unit_price), 0) AS revenue
     FROM rental_items ri
     JOIN rentals r ON r.id = ri.rental_id
     JOIN products p ON p.id = ri.product_id
     JOIN stores s ON s.id = r.store_id
     WHERE r.status NOT IN ('budget', 'cancelled') ${storeFilter} ${periodFilter}
     GROUP BY p.id, p.code, p.name, s.name
     ORDER BY rentals DESC, revenue DESC
     LIMIT 5`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    store_name: row.store_name,
    rentals: toNumber(row.rentals),
    revenue: toNumber(row.revenue),
  }));
};

const getTopCollections = async (storeId, period) => {
  const storeFilter = storeId ? 'AND r.store_id = ?' : '';
  const periodFilter = buildPeriodFilter('r.created_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       c.id,
       c.name,
       s.name AS store_name,
       COALESCE(SUM(ri.quantity), 0) AS rentals,
       COALESCE(SUM(ri.quantity * ri.unit_price), 0) AS revenue
     FROM rental_items ri
     JOIN rentals r ON r.id = ri.rental_id
     JOIN products p ON p.id = ri.product_id
     JOIN collections c ON c.id = p.collection_id
     JOIN stores s ON s.id = r.store_id
     WHERE r.status NOT IN ('budget', 'cancelled') ${storeFilter} ${periodFilter}
     GROUP BY c.id, c.name, s.name
     ORDER BY rentals DESC, revenue DESC
     LIMIT 5`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    store_name: row.store_name,
    rentals: toNumber(row.rentals),
    revenue: toNumber(row.revenue),
  }));
};

const getRecentRentals = async (storeId, period) => {
  const storeFilter = storeId ? 'WHERE r.store_id = ?' : 'WHERE 1 = 1';
  const periodFilter = buildPeriodFilter('r.created_at', period);
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       r.id,
       r.status,
       r.total_amount,
       r.start_date,
       r.end_date_scheduled,
       r.created_at,
       c.name AS customer_name,
       s.name AS store_name
     FROM rentals r
     JOIN customers c ON c.id = r.customer_id
     JOIN stores s ON s.id = r.store_id
     ${storeFilter} ${periodFilter}
     ORDER BY r.created_at DESC
     LIMIT 10`,
    params,
  );

  return rows.map((row) => ({
    ...row,
    total_amount: toNumber(row.total_amount),
  }));
};

const getUpcomingRentals = async (storeId) => {
  const [rows] = await db.query(
    `SELECT
       r.id,
       r.status,
       r.total_amount,
       c.name AS customer_name,
       CASE WHEN r.status = 'reserved' THEN 'pickup' ELSE 'return' END AS event_type,
       CASE
         WHEN r.status = 'reserved' THEN r.start_date
         ELSE r.end_date_scheduled
       END AS event_date
     FROM rentals r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.store_id = ?
       AND (
         (r.status = 'reserved' AND r.start_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY))
         OR
         (
           r.status IN ('picked_up', 'late')
           AND r.end_date_scheduled BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
         )
       )
     ORDER BY event_date ASC
     LIMIT 10`,
    [storeId],
  );

  return rows.map((row) => ({
    ...row,
    total_amount: toNumber(row.total_amount),
  }));
};

const getTodayOperations = async (storeId) => {
  const [rows] = await db.query(
    `SELECT
       operations.id,
       operations.status,
       operations.total_amount,
       operations.customer_name,
       operations.event_type,
       operations.event_date
     FROM (
       SELECT
         r.id,
         r.status,
         r.total_amount,
         c.name AS customer_name,
         'pickup' AS event_type,
         r.start_date AS event_date
       FROM rentals r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.store_id = ?
         AND r.start_date >= CURDATE()
         AND r.start_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
         AND r.status IN ('reserved', 'picked_up', 'late', 'returned')

       UNION ALL

       SELECT
         r.id,
         r.status,
         r.total_amount,
         c.name AS customer_name,
         'return' AS event_type,
         r.end_date_scheduled AS event_date
       FROM rentals r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.store_id = ?
         AND r.end_date_scheduled >= CURDATE()
         AND r.end_date_scheduled < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
         AND r.status IN ('picked_up', 'late', 'returned')
     ) operations
     ORDER BY operations.event_date ASC, operations.customer_name ASC`,
    [storeId, storeId],
  );

  return rows.map((row) => ({
    ...row,
    total_amount: toNumber(row.total_amount),
  }));
};

const getTransferSummary = async (storeId, period) => {
  const scopeFilter = storeId ? 'AND (t.from_store_id = ? OR t.to_store_id = ?)' : '';
  const scopeParams = storeId ? [storeId, storeId] : [];
  const periodFilter = buildPeriodFilter('t.requested_at', period);

  const [statusResult, routeResult] = await Promise.all([
    db.query(
      `SELECT t.status, COUNT(*) AS count
       FROM product_transfers t
       WHERE 1 = 1 ${scopeFilter} ${periodFilter}
       GROUP BY t.status`,
      scopeParams,
    ),
    db.query(
      `SELECT
         t.from_store_id,
         sf.name AS from_store_name,
         t.to_store_id,
         st.name AS to_store_name,
         COUNT(*) AS count
       FROM product_transfers t
       JOIN stores sf ON sf.id = t.from_store_id
       JOIN stores st ON st.id = t.to_store_id
       WHERE 1 = 1 ${scopeFilter} ${periodFilter}
       GROUP BY t.from_store_id, sf.name, t.to_store_id, st.name
       ORDER BY count DESC
       LIMIT 5`,
      scopeParams,
    ),
  ]);

  const counts = new Map(statusResult[0].map((row) => [row.status, toNumber(row.count)]));
  const inTransit = counts.get('active') || 0;
  const completed = counts.get('completed') || 0;
  const cancelled = counts.get('cancelled') || 0;

  return {
    total: inTransit + completed + cancelled,
    in_transit: inTransit,
    completed,
    cancelled,
    routes: routeResult[0].map((row) => ({
      from_store_id: row.from_store_id,
      from_store_name: row.from_store_name,
      to_store_id: row.to_store_id,
      to_store_name: row.to_store_name,
      count: toNumber(row.count),
    })),
  };
};

const getInventoryInsights = async (storeId) => {
  const storeFilter = storeId ? 'AND p.store_id = ?' : '';
  const params = storeId ? [storeId] : [];

  const [rows] = await db.query(
    `SELECT
       p.id,
       p.code,
       p.name,
       s.name AS store_name,
       p.purchase_price,
       p.status,
       COALESCE(
         SUM(CASE WHEN r.id IS NOT NULL THEN ri.quantity * ri.unit_price ELSE 0 END),
         0
       ) AS lifetime_revenue,
       MAX(CASE WHEN r.id IS NOT NULL THEN r.start_date END) AS last_rental_at,
       DATEDIFF(
         CURDATE(),
         COALESCE(MAX(CASE WHEN r.id IS NOT NULL THEN r.start_date END), p.created_at)
       ) AS days_without_rental
     FROM products p
     JOIN stores s ON s.id = p.store_id
     LEFT JOIN rental_items ri ON ri.product_id = p.id
     LEFT JOIN rentals r ON r.id = ri.rental_id AND r.status NOT IN ('budget', 'cancelled')
     WHERE p.status <> 'discarded' ${storeFilter}
     GROUP BY p.id, p.code, p.name, s.name, p.purchase_price, p.status, p.created_at`,
    params,
  );

  const products = rows.map((row) => {
    const purchasePrice = toNumber(row.purchase_price);
    const lifetimeRevenue = toNumber(row.lifetime_revenue);
    const daysWithoutRental = toNumber(row.days_without_rental);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      store_name: row.store_name,
      status: row.status,
      purchase_price: purchasePrice,
      lifetime_revenue: lifetimeRevenue,
      roi_percentage: purchasePrice > 0 ? roundTwo((lifetimeRevenue / purchasePrice) * 100) : null,
      last_rental_at: row.last_rental_at,
      days_without_rental: daysWithoutRental,
      is_paid_off: purchasePrice > 0 && lifetimeRevenue >= purchasePrice,
      is_stale: row.status === 'available' && daysWithoutRental >= 90,
    };
  });

  const paidOff = products
    .filter((product) => product.is_paid_off)
    .sort((a, b) => (b.roi_percentage || 0) - (a.roi_percentage || 0));
  const stale = products
    .filter((product) => product.is_stale)
    .sort((a, b) => b.days_without_rental - a.days_without_rental);

  return {
    paid_off_count: paidOff.length,
    paid_off_value: paidOff.reduce((sum, product) => sum + product.purchase_price, 0),
    stale_count: stale.length,
    stale_value: stale.reduce((sum, product) => sum + product.purchase_price, 0),
    paid_off_products: paidOff.slice(0, 5),
    stale_products: stale.slice(0, 5),
  };
};

const getWeekOperations = async (storeId) => {
  const [rows] = await db.query(
    `SELECT
       operations.id,
       operations.status,
       operations.total_amount,
       operations.customer_name,
       operations.event_type,
       operations.event_date
     FROM (
       SELECT
         r.id,
         r.status,
         r.total_amount,
         c.name AS customer_name,
         'pickup' AS event_type,
         r.start_date AS event_date
       FROM rentals r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.store_id = ?
         AND r.start_date >= CURDATE()
         AND r.start_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         AND r.status IN ('reserved', 'picked_up', 'late', 'returned')

       UNION ALL

       SELECT
         r.id,
         r.status,
         r.total_amount,
         c.name AS customer_name,
         'return' AS event_type,
         r.end_date_scheduled AS event_date
       FROM rentals r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.store_id = ?
         AND r.end_date_scheduled >= CURDATE()
         AND r.end_date_scheduled < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         AND r.status IN ('picked_up', 'late', 'returned')

       UNION ALL

       SELECT
         r.id,
         r.status,
         r.total_amount,
         c.name AS customer_name,
         'fitting' AS event_type,
         r.fitting_date AS event_date
       FROM rentals r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.store_id = ?
         AND r.fitting_date IS NOT NULL
         AND r.fitting_date >= CURDATE()
         AND r.fitting_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         AND r.status IN ('reserved', 'picked_up', 'late')
     ) operations
     ORDER BY operations.event_date ASC, operations.customer_name ASC`,
    [storeId, storeId, storeId],
  );

  return rows.map((row) => ({
    ...row,
    total_amount: toNumber(row.total_amount),
  }));
};

const getLocalReceivables = async (storeId) => {
  const [summaryResult, itemResult] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(
           SUM(
             CASE
               WHEN i.due_date < CURDATE() THEN GREATEST(i.value - i.amount_paid, 0)
               ELSE 0
             END
           ),
           0
         ) AS overdue_total,
         COALESCE(SUM(CASE WHEN i.due_date < CURDATE() THEN 1 ELSE 0 END), 0) AS overdue_count,
         COALESCE(
           SUM(
             CASE
               WHEN i.due_date >= CURDATE() THEN GREATEST(i.value - i.amount_paid, 0)
               ELSE 0
             END
           ),
           0
         ) AS pending_total,
         COALESCE(SUM(CASE WHEN i.due_date >= CURDATE() THEN 1 ELSE 0 END), 0) AS pending_count
       FROM installments i
       JOIN rentals r ON r.id = i.rental_id
       WHERE r.store_id = ?
         AND r.status <> 'cancelled'
         AND i.status IN ('pending', 'partially_paid', 'overdue')`,
      [storeId],
    ),
    db.query(
      `SELECT
         i.id,
         i.rental_id,
         i.number,
         i.total_installments,
         i.value,
         i.amount_paid,
         GREATEST(i.value - i.amount_paid, 0) AS balance,
         i.due_date,
         i.status,
         CASE WHEN i.due_date < CURDATE() THEN 1 ELSE 0 END AS is_overdue,
         c.id AS customer_id,
         c.name AS customer_name,
         r.status AS rental_status,
         r.start_date,
         r.end_date_scheduled
       FROM installments i
       JOIN rentals r ON r.id = i.rental_id
       JOIN customers c ON c.id = r.customer_id
       WHERE r.store_id = ?
         AND r.status <> 'cancelled'
         AND i.status IN ('pending', 'partially_paid', 'overdue')
       ORDER BY (i.due_date < CURDATE()) DESC, i.due_date ASC
       LIMIT 20`,
      [storeId],
    ),
  ]);

  const summary = summaryResult[0][0] || {};

  return {
    overdue_total: toNumber(summary.overdue_total),
    overdue_count: toNumber(summary.overdue_count),
    pending_total: toNumber(summary.pending_total),
    pending_count: toNumber(summary.pending_count),
    items: itemResult[0].map((row) => ({
      ...row,
      value: toNumber(row.value),
      amount_paid: toNumber(row.amount_paid),
      balance: toNumber(row.balance),
      is_overdue: toBoolean(row.is_overdue),
    })),
  };
};

const getLocalTransfers = async (storeId, period) => {
  const periodFilter = buildPeriodFilter('t.requested_at', period);
  const [transferResult, completedResult] = await Promise.all([
    db.query(
      `SELECT
         t.id,
         t.product_id,
         t.status,
         t.requested_at,
         t.from_store_id,
         t.to_store_id,
         p.name AS product_name,
         p.code AS product_code,
         sf.name AS from_store_name,
         st.name AS to_store_name,
         u.name AS requested_by_name,
         CASE WHEN t.to_store_id = ? THEN 'incoming' ELSE 'outgoing' END AS direction
       FROM product_transfers t
       JOIN products p ON p.id = t.product_id
       JOIN stores sf ON sf.id = t.from_store_id
       JOIN stores st ON st.id = t.to_store_id
       LEFT JOIN users u ON u.id = t.requested_by
       WHERE t.status = 'active'
         AND (t.to_store_id = ? OR t.from_store_id = ?)
       ORDER BY t.requested_at DESC`,
      [storeId, storeId, storeId],
    ),
    db.query(
      `SELECT COUNT(*) AS total
       FROM product_transfers t
       WHERE t.status = 'completed'
         AND (t.from_store_id = ? OR t.to_store_id = ?)
         ${periodFilter}`,
      [storeId, storeId],
    ),
  ]);

  const incoming = transferResult[0].filter((row) => row.direction === 'incoming');
  const outgoing = transferResult[0].filter((row) => row.direction === 'outgoing');

  return {
    in_transit_incoming: incoming.length,
    in_transit_outgoing: outgoing.length,
    completed_in_period: toNumber(completedResult[0][0]?.total),
    incoming,
    outgoing,
  };
};

const getMaintenanceProducts = async (storeId) => {
  const [rows] = await db.query(
    `SELECT
       p.id,
       p.code,
       p.name,
       p.status,
       p.updated_at
     FROM products p
     WHERE p.store_id = ?
       AND p.status IN ('laundry', 'maintenance')
     ORDER BY p.updated_at ASC`,
    [storeId],
  );

  const laundry = rows.filter((row) => row.status === 'laundry').length;
  const maintenance = rows.filter((row) => row.status === 'maintenance').length;

  return {
    total: rows.length,
    laundry,
    maintenance,
    items: rows,
  };
};

const getStore = async (storeId) => {
  const [rows] = await db.query(
    `SELECT
       s.id,
       s.name,
       s.cnpj,
       s.is_active,
       s.created_at,
       (
         SELECT a.city
         FROM addresses a
         WHERE a.store_id = s.id
         ORDER BY a.is_default DESC, a.created_at ASC
         LIMIT 1
       ) AS city,
       (
         SELECT a.state
         FROM addresses a
         WHERE a.store_id = s.id
         ORDER BY a.is_default DESC, a.created_at ASC
         LIMIT 1
       ) AS state
     FROM stores s
     WHERE s.id = ?
     LIMIT 1`,
    [storeId],
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    is_active: toBoolean(rows[0].is_active),
  };
};

const getLateRentals = (statusBreakdown) => {
  return statusBreakdown.find((item) => item.status === 'late')?.count || 0;
};

exports.getGeneralDashboard = async (req, res) => {
  try {
    const period = normalizePeriod(req.query?.period);

    const [
      revenue,
      rentalCounts,
      pendingReceivables,
      overdueReceivables,
      rentalStatusBreakdown,
      revenueByMonth,
      paymentsByMethod,
      storeCounts,
      customerCount,
      productCount,
      stores,
      topProducts,
      topCollections,
      recentRentals,
      receivablesForecast,
      transfers,
      inventory,
    ] = await Promise.all([
      getRevenueTotals(null, period),
      getRentalCounts(null, period),
      getPendingReceivables(null, period),
      getOverdueReceivables(null, period),
      getRentalStatusBreakdown(null, period),
      getRevenueByMonth(null, period),
      getPaymentsByMethod(null, period),
      getStoreCounts(),
      getCustomerCount(),
      getProductCount(),
      getStorePerformance(period),
      getTopProducts(null, period),
      getTopCollections(null, period),
      getRecentRentals(null, period),
      getReceivablesForecast(null),
      getTransferSummary(null, period),
      getInventoryInsights(null),
    ]);

    const { previous_revenue, growth_percentage, ...revenueSummary } = revenue;
    const delinquencyRate =
      revenueSummary.total_revenue > 0
        ? roundTwo((overdueReceivables.overdue_receivables / revenueSummary.total_revenue) * 100)
        : 0;

    return res.status(200).json({
      status: 'success',
      data: {
        generated_at: new Date().toISOString(),
        period,
        comparison: {
          previous_revenue,
          growth_percentage,
        },
        summary: {
          ...revenueSummary,
          ...rentalCounts,
          pending_receivables: pendingReceivables,
          ...overdueReceivables,
          delinquency_rate: delinquencyRate,
          total_customers: customerCount,
          total_products: productCount,
          ...storeCounts,
        },
        rentals_by_status: rentalStatusBreakdown,
        revenue_by_month: revenueByMonth,
        payments_by_method: paymentsByMethod,
        receivables_forecast: receivablesForecast,
        stores,
        top_products: topProducts,
        top_collections: topCollections,
        recent_rentals: recentRentals,
        transfers,
        inventory,
      },
    });
  } catch (error) {
    console.error('Error fetching general dashboard:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro interno ao carregar o dashboard geral.',
    });
  }
};

exports.getLocalDashboard = async (req, res) => {
  try {
    const { storeId } = req.params;
    const period = normalizePeriod(req.query?.period);
    const isAdmin = req.user?.role === 'admin';

    if (!isAdmin && (!req.user?.storeId || req.user.storeId !== storeId)) {
      return res.status(403).json({
        status: 'error',
        message: 'Você não tem permissão para acessar o dashboard de outra loja.',
      });
    }

    const store = await getStore(storeId);

    if (!store) {
      return res.status(404).json({
        status: 'error',
        message: 'Loja não encontrada.',
      });
    }

    const [
      revenue,
      rentalCounts,
      pendingReceivables,
      overdueReceivables,
      rentalStatusBreakdown,
      revenueByMonth,
      paymentsByMethod,
      customerCount,
      productCounts,
      topProducts,
      recentRentals,
      upcomingRentals,
      todayOperations,
      weekOperations,
      todayReceipts,
      receivables,
      transfers,
      maintenance,
    ] = await Promise.all([
      getRevenueTotals(storeId, period),
      getRentalCounts(storeId, period),
      getPendingReceivables(storeId, period),
      getOverdueReceivables(storeId, period),
      getRentalStatusBreakdown(storeId, period),
      getRevenueByMonth(storeId, period),
      getPaymentsByMethod(storeId, period),
      getStoreCustomerCount(storeId, period),
      getStoreProductCounts(storeId),
      getTopProducts(storeId, period),
      getRecentRentals(storeId, period),
      getUpcomingRentals(storeId),
      getTodayOperations(storeId),
      getWeekOperations(storeId),
      getTodayReceipts(storeId),
      getLocalReceivables(storeId),
      getLocalTransfers(storeId, period),
      getMaintenanceProducts(storeId),
    ]);

    const { previous_revenue, growth_percentage, ...revenueSummary } = revenue;
    const delinquencyRate =
      revenueSummary.total_revenue > 0
        ? roundTwo((overdueReceivables.overdue_receivables / revenueSummary.total_revenue) * 100)
        : 0;
    const availability = {
      total: productCounts.total_products,
      available: productCounts.available_products,
      reserved: productCounts.reserved_products,
      rented: productCounts.rented_products,
      laundry: productCounts.laundry_products,
      maintenance: productCounts.maintenance_products,
      transferring: productCounts.transferring_products,
      discarded: productCounts.discarded_products,
      active: productCounts.active_products,
      occupancy_rate: productCounts.occupancy_rate,
    };

    return res.status(200).json({
      status: 'success',
      data: {
        generated_at: new Date().toISOString(),
        period,
        comparison: {
          previous_revenue,
          growth_percentage,
        },
        store,
        summary: {
          ...revenueSummary,
          ...rentalCounts,
          late_rentals: getLateRentals(rentalStatusBreakdown),
          pending_receivables: pendingReceivables,
          ...overdueReceivables,
          delinquency_rate: delinquencyRate,
          total_customers: customerCount,
          ...productCounts,
        },
        rentals_by_status: rentalStatusBreakdown,
        revenue_by_month: revenueByMonth,
        payments_by_method: paymentsByMethod,
        top_products: topProducts,
        recent_rentals: recentRentals,
        upcoming_rentals: upcomingRentals,
        today_operations: todayOperations,
        week_operations: weekOperations,
        today_receipts: todayReceipts,
        availability,
        receivables,
        transfers,
        maintenance,
      },
    });
  } catch (error) {
    console.error('Error fetching local dashboard:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro interno ao carregar o dashboard da loja.',
    });
  }
};

module.exports = exports;
