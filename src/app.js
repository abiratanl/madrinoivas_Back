const express = require('express');
const cors = require('cors');
//const swaggerUi = require('swagger-ui-express');

// --- DOCUMENTATION IMPORT ---
//const swaggerDocument = require('./docs/swagger');

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

// Rota de Teste Absoluto
app.get('/batata', (req, res) => {
  console.log('>>> A REQUISIÇÃO CHEGOU NO SERVIDOR! <<<');
  res.send('<h1>Se essa tela abriu, o seu computador está bloqueando a palavra api-docs!</h1>');
});

// --- CORS CONFIGURATION ---
const allowedOrigins = [process.env.FRONTEND_URL, process.env.API_URL].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Adicione este log para ver no terminal exatamente o que está bloqueado
      if (origin) console.log('Tentativa de conexão vinda de:', origin);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Isso vai imprimir o erro real no terminal
        console.error('CORS Bloqueado para a origem:', origin);
        callback(new Error('Bloqueado pelo CORS do Madri Noivas em Dev'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// --- GLOBAL MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================================================================================
// RENDERIZADOR NATIVO (Sem dependências, sem erros de importação)
// ==================================================================================
const swaggerDocument = require('./docs/swagger');

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

// ==================================================================================
// 2º LUGAR: SECURITY & TRAFFIC CONTROL
// Protege os endpoints de negócio (/api/users, /api/auth...) sem interferir no Swagger
// ==================================================================================
app.use('/api', apiLimiter);

// --- ROOT ENDPOINT ---
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Madri Noivas API is running',
    documentation: swaggerPath,
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
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do Servidor.',
  });
});

module.exports = app;
