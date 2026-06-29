const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

// --- DOCUMENTATION IMPORT ---
// Imports the pre-compiled swagger schema object from the docs folder
const swaggerDocument = require('./docs/swagger');

// --- ROUTE IMPORTS ---
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

// --- CORS CONFIGURATION ---
// Whitelists local development origins alongside the production frontend URL
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean); // Sanitizes the array by filtering out undefined or null values

app.use(
  cors({
    origin: (origin, callback) => {
      // Allows requests with no origin (like mobile apps, curl, or direct browser URL navigation)
      // or if the origin is explicitly included in our whitelist array
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Bloqueado pelo CORS do Madri Noivas em Dev'));
      }
    },
    credentials: true, // Enables cross-origin cookie sharing and authorization headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// --- GLOBAL MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SECURITY & TRAFFIC CONTROL ---
// Placed near the top to protect all downstream /api endpoints from brute-force/DoS attacks
app.use('/api', apiLimiter);

// --- DYNAMIC SWAGGER ROUTING ---
// Local (VM default): http://localhost:3000/api-docs
// Production (VPS env): https://www.madrinoivas.com.br/api/api-docs
const swaggerPath = process.env.SWAGGER_PATH || '/api-docs';

const swaggerOptions = {
  swaggerOptions: {
    url: `${swaggerPath}/swagger.json`, // Dynamically syncs the UI file fetching path
  },
};

// Explicitly exposes the raw JSON documentation schema endpoint
app.get(`${swaggerPath}/swagger.json`, (req, res) => res.json(swaggerDocument));

// Mounts the graphical Swagger interface middleware stack
app.use(swaggerPath, swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

// --- ROOT ENDPOINT ---
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Madri Noivas API is running',
    documentation: swaggerPath, // Reflects the active documentation path based on environment
  });
});

// --- API DOMAIN ROUTES ---
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/transfers', transferRoutes);

// --- GLOBAL ERROR HANDLER ---
// Catch-all middleware to prevent internal server details leakage on unexpected runtime failures
app.use((err, req, res, _next) => {
  console.error(err.stack); // Outputs the structural stack trace inside the server logs
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do Servidor.', // Standard user-facing error message
  });
});

module.exports = app;
