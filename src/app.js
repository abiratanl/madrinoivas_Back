const express = require('express');
const cors = require('cors');
//const swaggerUi = require('swagger-ui-express');

// --- DOCUMENTATION IMPORT ---
const swaggerDocument = require('./docs/swagger');

// --- ROUTE IMPORTS ---
const authRoutes = require('./routes/authRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const customerRoutes = require('./routes/customerRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const contractRoutes = require('./routes/contractRoutes');
const productRoutes = require('./routes/productRoutes');
const rentalRoutes = require('./routes/rentalRoutes');
const storeRoutes = require('./routes/storeRoutes');
const transferRoutes = require('./routes/transferRoutes');
const userRoutes = require('./routes/userRoutes');
const { apiLimiter } = require('./middlewares/rateLimitMiddleware');

const app = express();
app.set('trust proxy', 1);
const swaggerPath = '/api-docs';

// --- CORS CONFIGURATION ---

const localhostRegex = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const productionRegex = /^https?:\/\/(www\.)?madrinoivas\.com\.br$/;

const ngrokRegex = /^https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/;

app.use(
  cors({
    origin(origin, callback) {
      // Permite Postman, Insomnia, curl etc.
      if (!origin) {
        return callback(null, true);
      }

      if (localhostRegex.test(origin) || productionRegex.test(origin) || ngrokRegex.test(origin)) {
        return callback(null, true);
      }

      callback(new Error(`Origem não permitida: ${origin}`));
    },
    credentials: true,
  }),
);

// --- GLOBAL MIDDLEWARES ---
// Larger JSON limit to accept the lessee signature (base64 data URL) on contract generation
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================================================================================
// RENDERIZADOR NATIVO (Apenas em desenvolvimento)
// ==================================================================================

if (process.env.NODE_ENV !== 'production') {
  app.get('/api-docs', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Madri Noivas API</title>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css" />
        </head>
        <body>
          <div id="swagger-ui"></div>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js"></script>
          <script>
            SwaggerUIBundle({
              spec: ${JSON.stringify(swaggerDocument)},
              dom_id: '#swagger-ui'
            });
          </script>
        </body>
      </html>
    `);
  });
} else {
  // Em produção, retorna 404
  app.get('/api-docs', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

// ==================================================================================
// 2º LUGAR: SECURITY & TRAFFIC CONTROL
// Protege os endpoints de negócio (/api/users, /api/auth...) sem interferir no Swagger
// Exclui /api/auth que já tem rate limiter específico (loginLimiter)
// ==================================================================================
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// --- ROOT ENDPOINT ---
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Madri Noivas API is running',
    documentation: swaggerPath,
  });
});

// --- PUBLIC ROUTES (no auth required for home page) ---
const publicBannerRoutes = require('./routes/publicBannerRoutes');
const publicCollectionRoutes = require('./routes/publicCollectionRoutes');
const publicProductRoutes = require('./routes/publicProductRoutes');

app.use('/api/public/banners', publicBannerRoutes);
app.use('/api/public/collections', publicCollectionRoutes);
app.use('/api/public/products', publicProductRoutes);

// --- API DOMAIN ROUTES ---
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/transfers', transferRoutes);

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do Servidor.',
  });
});

module.exports = app;
