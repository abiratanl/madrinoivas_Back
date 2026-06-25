const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

// --- IMPORTAÇÃO DA DOCUMENTAÇÃO ---
const swaggerDocument = require('./docs/swagger'); // <--- Aqui está a mágica

// --- IMPORTS DE ROTAS ---
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const productRoutes = require('./routes/productRoutes');
const rentalRoutes = require('./routes/rentalRoutes');
const storeRoutes = require('./routes/storeRoutes');
const transferRoutes = require('./routes/transferRoutes');
const userRoutes = require('./routes/userRoutes');
const { apiLimiter } = require('./middlewares/rateLimitMiddleware');

const app = express();

// --- CONFIGURAÇÃO CORS ---
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ROTA DO SWAGGER ---
// Carrega o arquivo externo que criamos
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Rate Limiter
app.use('/api', apiLimiter);

// Rota Raiz
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Boilerplate API is running',
    documentation: '/api-docs',
  });
});

// --- ROTAS DA API ---
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/transfers', transferRoutes);

// Global Error Handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do Servidor.',
  });
});

module.exports = app;
