// src/teste-swagger.js
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const app = express();

const doc = {
  openapi: '3.0.0',
  info: { title: 'Teste Isolado', version: '1.0.0' },
  paths: {
    '/teste': { get: { responses: { 200: { description: 'OK' } } } },
  },
};

app.use('/', swaggerUi.serve, swaggerUi.setup(doc));

app.listen(3000, () => {
  console.log('🔥 Teste rodando em: http://localhost:3000');
});
