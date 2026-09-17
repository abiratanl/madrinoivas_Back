// src/docs/swagger.js
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Madri Noivas API',
    version: '1.0.0',
    description: 'Sistema de Gerenciamento de Rede de Lojas de Aluguel de Trajes',
  },
  servers: [
    {
      url: process.env.API_URL || 'http://localhost:3000',
      description: `${process.env.NODE_ENV || 'development'} server`,
    },
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
    // ==========================================
    // AUTHENTICATION (AUTH)
    // ==========================================
    '/api/auth/login': {
      post: {
        summary: 'Fazer Login',
        description: 'Autentica o usuário e retorna um token JWT. Protegido por Rate Limiting.',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'admin@madrinoivas.com.br' },
                  password: { type: 'string', example: 'senha123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login realizado com sucesso' },
          401: { description: 'Credenciais inválidas' },
          429: { description: 'Muitas tentativas. Tente novamente mais tarde.' },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        summary: 'Solicitar recuperação de senha',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', example: 'admin@madrinoivas.com.br' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Token de recuperação enviado por e-mail' },
        },
      },
    },
    '/api/auth/reset-password/{token}': {
      post: {
        summary: 'Redefinir senha com token',
        tags: ['Auth'],
        security: [],
        parameters: [
          {
            in: 'path',
            name: 'token',
            required: true,
            schema: { type: 'string' },
            description: 'Token recebido por e-mail',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  password: { type: 'string', example: 'NovaSenhaSegura123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Senha alterada com sucesso' },
          400: { description: 'Token inválido ou expirado' },
        },
      },
    },
    '/api/auth/change-password': {
      post: {
        summary: 'Alterar senha (Usuário logado)',
        description: 'Usado para troca de senha temporária ou alteração voluntária.',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', example: 'senhaAntiga123' },
                  newPassword: { type: 'string', example: 'senhaNova123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Senha alterada com sucesso' },
          401: { description: 'Senha atual incorreta' },
        },
      },
    },

    // ==========================================
    // USERS (USUÁRIOS)
    // ==========================================
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
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Novo Funcionário' },
                  email: { type: 'string', example: 'novo@loja.com' },
                  password: { type: 'string', example: 'senha123' },
                  role: { type: 'string', enum: ['admin', 'proprietario', 'atendente'], example: 'atendente' },
                  store_id: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Usuário criado com sucesso' }, 409: { description: 'E-mail já existe' } },
      },
    },
    '/api/users/{id}': {
      get: {
        summary: 'Buscar usuário por ID',
        tags: ['Users'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Dados do usuário' }, 404: { description: 'Usuário não encontrado' } },
      },
      put: {
        summary: 'Atualizar usuário',
        tags: ['Users'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'proprietario', 'atendente'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Atualizado com sucesso' } },
      },
      delete: {
        summary: 'Excluir usuário',
        tags: ['Users'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Excluído com sucesso' } },
      },
    },

    // ==========================================
    // PROFILE (PERFIL DO USUÁRIO LOGADO)
    // ==========================================
    '/api/users/me': {
      get: {
        summary: 'Ver meu perfil',
        tags: ['Profile'],
        responses: { 200: { description: 'Dados do perfil atual' } },
      },
      put: {
        summary: 'Atualizar meu perfil (Nome)',
        tags: ['Profile'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string', example: 'Meu Novo Nome' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Perfil atualizado' } },
      },
    },

    // ==========================================
    // CATEGORIES (CATEGORIAS)
    // ==========================================
    '/api/categories': {
      get: {
        summary: 'Listar todas as categorias',
        tags: ['Categories'],
        responses: { 200: { description: 'Lista de categorias retornada com sucesso' } },
      },
      post: {
        summary: 'Criar uma nova categoria',
        tags: ['Categories'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', example: 'Vestidos de Noiva' } },
              },
            },
          },
        },
        responses: { 201: { description: 'Categoria criada' } },
      },
    },
    '/api/categories/{id}': {
      put: {
        summary: 'Atualizar categoria',
        tags: ['Categories'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        },
        responses: { 200: { description: 'Atualizada com sucesso' } },
      },
      delete: {
        summary: 'Excluir categoria',
        tags: ['Categories'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Excluída com sucesso' } },
      },
    },

    // ==========================================
    // PRODUCTS (PRODUTOS)
    // ==========================================
    '/api/products': {
      get: {
        summary: 'Listar produtos',
        tags: ['Products'],
        parameters: [
          { in: 'query', name: 'category_id', schema: { type: 'string', format: 'uuid' }, required: false, description: 'Filtrar por categoria' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['available', 'reserved', 'rented', 'laundry'] }, required: false },
        ],
        responses: { 200: { description: 'Lista de produtos obtida com sucesso' } },
      },
      post: {
        summary: 'Cadastrar novo produto/vestido',
        tags: ['Products'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'category_id', 'rental_price'],
                properties: {
                  name: { type: 'string', example: 'Vestido Madri Imperial' },
                  category_id: { type: 'string', format: 'uuid' },
                  rental_price: { type: 'number', example: 1500.00 },
                  size: { type: 'string', example: 'M' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Produto cadastrado' } },
      },
    },

    // ==========================================
    // CUSTOMERS (CLIENTES)
    // ==========================================
    '/api/customers': {
      get: {
        summary: 'Listar todos os clientes',
        tags: ['Customers'],
        responses: { 200: { description: 'Lista de clientes obtida' } },
      },
      post: {
        summary: 'Cadastrar novo cliente',
        tags: ['Customers'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'cpf'],
                properties: {
                  name: { type: 'string', example: 'Maria Silva' },
                  cpf: { type: 'string', example: '123.456.789-00' },
                  phone: { type: 'string', example: '(12) 99999-9999' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Cliente criado com sucesso' } },
      },
    },

    // ==========================================
    // RENTALS (ALUGUÉIS) - CICLO COMPLETO
    // ==========================================
    '/api/rentals': {
      get: {
        summary: 'Listar aluguéis',
        tags: ['Rentals'],
        parameters: [
          {
            in: 'query',
            name: 'status',
            schema: { type: 'string', enum: ['budget', 'reserved', 'picked_up', 'returned', 'late', 'cancelled'] },
            required: false,
            description: 'Filtrar por status do aluguel',
          },
        ],
        responses: { 200: { description: 'Lista de aluguéis retornada com sucesso' } },
      },
      post: {
        summary: 'Criar novo aluguel ou orçamento',
        tags: ['Rentals'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['customer_id', 'products', 'start_date', 'end_date_scheduled'],
                properties: {
                  customer_id: { type: 'string', format: 'uuid', description: 'ID do cliente' },
                  products: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      required: ['id'],
                      properties: {
                        id: { type: 'string', format: 'uuid', description: 'ID do produto' },
                        quantity: { type: 'integer', default: 1, minimum: 1 },
                      },
                    },
                  },
                  start_date: { type: 'string', format: 'date-time', description: 'Data/hora de retirada programada' },
                  end_date_scheduled: { type: 'string', format: 'date-time', description: 'Data/hora de devolução programada' },
                  status: { type: 'string', enum: ['budget', 'reserved'], default: 'reserved', description: 'budget = orçamento, reserved = reserva confirmada' },
                  discount: { type: 'number', example: 0, minimum: 0, description: 'Desconto em valor absoluto' },
                  notes: { type: 'string', description: 'Observações internas' },
                  delivery_address_id: { type: 'string', format: 'uuid', nullable: true, description: 'ID do endereço de entrega (opcional)' },
                  delivery_type: { type: 'string', enum: ['pickup_store', 'delivery', 'shipping'], default: 'pickup_store', description: 'Tipo de entrega/retirada' },
                  laundry_days_needed: { type: 'integer', default: 2, minimum: 0, description: 'Dias necessários para lavanderia após devolução' },
                  store_id: { type: 'string', format: 'uuid', description: 'ID da loja. Obrigatório se o usuário logado não tiver store_id associado no token JWT. Preenchido automaticamente se o usuário (atendente) pertencer a uma loja.' },
                  user_id: { type: 'string', format: 'uuid', description: 'ID do vendedor. Preenchido automaticamente pelo usuário autenticado (req.user.id).' },
                  installments_config: {
                    type: 'object',
                    description: 'Configuração de parcelamento (ignorado se status=budget)',
                    properties: {
                      count: { type: 'integer', example: 3, minimum: 1, description: 'Número de parcelas' },
                      first_due_date: { type: 'string', format: 'date-time', description: 'Data do primeiro vencimento' },
                    },
                  },
                },
              },
example: {
                customer_id: "01eeaebf-9a1d-4b7e-ba26-fd00d8af1632",
                products: [
                  { "id": "027379fa-8492-4680-bbb8-a2c813860865", "quantity": 1 },
                  { "id": "6d0e63b3-155c-4893-b36d-d0bdb99a7a7b", "quantity": 1 }
                ],
                start_date: "2026-08-15 10:00:00",
                end_date_scheduled: "2026-08-20 18:00:00",
                status: "reserved",
                discount: 100.00,
                notes: "Cliente prefere retirada na loja centro",
                delivery_type: "pickup_store",
                laundry_days_needed: 2,
                store_id: "a6763a6f-09df-46bf-b076-1c553e76e3ec",
                installments_config: {
                  count: 3,
                  first_due_date: "2026-09-05 00:00:00"
                }
              }
            },
          },
        },
        responses: {
          201: {
            description: 'Aluguel criado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    data: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        total_amount: { type: 'number', example: 1400.00 },
                        status: { type: 'string', example: 'reserved' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Dados inválidos, produto indisponível ou loja não identificada' },
          401: { description: 'Não autenticado' },
          403: { description: 'Acesso negado' },
        },
      },
    },
    '/api/rentals/{id}': {
      get: {
        summary: 'Buscar aluguel por ID (Detalhes completos com itens e parcelas)',
        tags: ['Rentals'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Detalhes do aluguel' }, 403: { description: 'Acesso negado - aluguel de outra loja' }, 404: { description: 'Aluguel não encontrado' } },
      },
      put: {
        summary: 'Editar aluguel (Apenas orçamentos ou reservas antes da retirada)',
        tags: ['Rentals'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  discount: { type: 'number', minimum: 0, description: 'Desconto em valor absoluto' },
                  notes: { type: 'string' },
                  end_date_scheduled: { type: 'string', format: 'date-time', description: 'Nova data de devolução programada' },
                  start_date: { type: 'string', format: 'date-time', description: 'Nova data de retirada programada' },
                  delivery_type: { type: 'string', enum: ['pickup_store', 'delivery', 'shipping'], description: 'Tipo de entrega/retirada' },
                  delivery_address_id: { type: 'string', format: 'uuid', nullable: true, description: 'ID do endereço de entrega' },
                  laundry_days_needed: { type: 'integer', minimum: 0, description: 'Dias necessários para lavanderia' },
                  status: { type: 'string', enum: ['budget', 'reserved'], description: 'Apenas para orçamentos/reservas (não altera para picked_up)' },
                  products: {
                    type: 'array',
                    description: 'Substitui todos os itens do aluguel',
                    items: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, default: 1 } } },
                  },
                },
              },
              example: {
                discount: 50.00,
                end_date_scheduled: "2026-08-25 18:00:00",
                delivery_type: "delivery",
                delivery_address_id: "c3d4e5f6-5717-4562-b3fc-2c963f66afa6",
                products: [
                  { "id": "a1b2c3d4-5717-4562-b3fc-2c963f66afa6", "quantity": 1 },
                  { "id": "e5f6g7h8-5717-4562-b3fc-2c963f66afa6", "quantity": 1 }
                ]
              }
            },
          },
        },
        responses: {
          200: { description: 'Aluguel atualizado com sucesso' },
          400: { description: 'Não é possível editar um aluguel em andamento ou finalizado' },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
    '/api/rentals/{id}/pickup': {
      post: {
        summary: 'Confirmar retirada do traje (Muda status para picked_up)',
        tags: ['Rentals'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Retirada confirmada. Traje em uso.' },
          400: { description: 'Status do aluguel não permite retirada.' },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
    '/api/rentals/{id}/extend': {
      post: {
        summary: 'Prorrogar aluguel (Adicionar dias e valor extra ao total)',
        tags: ['Rentals'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['new_end_date'],
                  properties: {
                    new_end_date: { type: 'string', format: 'date-time', description: 'Nova data de devolução programada (formato MySQL: YYYY-MM-DD HH:MM:SS)' },
                    extra_amount: { type: 'number', description: 'Valor adicional cobrado pela prorrogação' },
                  },
                },
                example: {
                  new_end_date: "2026-08-30 18:00:00",
                  extra_amount: 150.00
                }
              },
            },
          },
        responses: {
          200: { description: 'Aluguel prorrogado com sucesso' },
          400: { description: 'Não é possível prorrogar: aluguel não está em andamento (status deve ser picked_up ou late), data inválida ou aluguel não encontrado.' },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
    '/api/rentals/{id}/return': {
      post: {
        summary: 'Registrar devolução (Envia produtos para status laundry)',
        tags: ['Rentals'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  penalty_fee: { type: 'number', description: 'Multa por atraso ou dano (opcional)' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Devolução registrada. Produtos enviados para lavanderia.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    message: { type: 'string', example: 'Devolução registrada. Produtos enviados para lavanderia.' },
                    penaltyFee: { type: 'number', example: 150.00, description: 'Multa calculada por atraso (se houver)' }
                  }
                }
              }
            }
          },
          400: { description: 'Aluguel já foi finalizado ou cancelado.' },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
    '/api/rentals/{id}/cancel': {
      post: {
        summary: 'Cancelar aluguel (Libera produtos reservados de volta para available)',
        tags: ['Rentals'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Aluguel cancelado e produtos liberados.' },
          400: { description: 'Não é possível cancelar aluguel em andamento (picked_up, late) ou finalizado.' },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
  },
};

module.exports = swaggerDocument;