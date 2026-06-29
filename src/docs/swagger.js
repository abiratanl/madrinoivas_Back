// src/docs/swagger.js

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Madri Noivas API',
    version: '1.0.0',
    description: 'Sistema de Gerenciamento de Rede de Lojas de Aluguel de Trajes',
  },
  servers: [
    // Atenção: Mantenha a porta que você está usando (3000 ou 3002)
    { url: 'http://localhost:3000', description: 'Servidor Local' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // --- AUTH ---
    '/api/auth/login': {
      post: {
        summary: 'Fazer Login',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@teste.com' },
                  password: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Login realizado com sucesso' } },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        summary: 'Recuperar Senha',
        tags: ['Auth'],
        security: [],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { email: { type: 'string' } } },
            },
          },
        },
        responses: { 200: { description: 'Email enviado' } },
      },
    },

    // --- USERS ---
    '/api/users': {
      get: {
        summary: 'Listar Usuários',
        tags: ['Users'],
        responses: { 200: { description: 'Lista de usuários' } },
      },
      post: {
        summary: 'Criar Usuário',
        tags: ['Users'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  role: { type: 'string' },
                  store_id: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Criado com sucesso' } },
      },
    },

    // --- STORES / SHOWROOM ---
    '/api/stores': {
      get: {
        summary: 'Listar Lojas Disponíveis',
        tags: ['Lojas'],
        responses: {
          200: {
            description: 'Lista de lojas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    data: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
    },

    // --- PLACEHOLDERS ---
    '/api/products': {
      get: {
        summary: 'Listar Produtos',
        tags: ['Produtos'],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/rentals': {
      get: {
        summary: 'Listar Aluguéis',
        tags: ['Aluguéis'],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/categories': {
      get: {
        summary: 'Listar Categorias',
        tags: ['Categorias'],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/customers': {
      get: {
        summary: 'Listar Clientes',
        tags: ['Clientes'],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
};

module.exports = swaggerDocument;
