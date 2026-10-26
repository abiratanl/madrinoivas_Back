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
    schemas: {
      StoreContactInput: {
        type: 'object',
        required: ['type', 'value'],
        properties: {
          type: {
            type: 'string',
            enum: ['mobile', 'whatsapp', 'landline', 'email', 'instagram', 'facebook'],
            example: 'whatsapp',
          },
          value: { type: 'string', example: '(12) 99999-9999' },
          is_primary: { type: 'boolean', example: true },
        },
      },
      StoreAddressInput: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['residential', 'commercial', 'delivery', 'event_venue'],
            example: 'commercial',
          },
          label: { type: 'string', example: 'Principal' },
          zip_code: { type: 'string', example: '12505-010' },
          street: { type: 'string', example: 'R. Dr. Castro Santos' },
          number: { type: 'string', example: '98' },
          complement: { type: 'string', example: 'Sala 2' },
          neighborhood: { type: 'string', example: 'Centro' },
          city: { type: 'string', example: 'Guaratinguetá' },
          state: { type: 'string', example: 'SP' },
          is_default: { type: 'boolean', example: true },
        },
      },
      StoreInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Madri Noivas - Guaratinguetá' },
          cnpj: { type: 'string', example: '12.345.678/0001-90' },
          owner_name: { type: 'string', example: 'João da Silva' },
          owner_cpf: { type: 'string', example: '123.456.789-00' },
          owner_signature: {
            type: 'string',
            description: 'Assinatura digitalizada do responsável como data URL (PNG/JPEG)',
          },
          contacts: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoreContactInput' },
          },
          addresses: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoreAddressInput' },
          },
        },
      },
      Store: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          cnpj: { type: 'string', nullable: true },
          owner_name: { type: 'string', nullable: true },
          owner_cpf: { type: 'string', nullable: true },
          owner_signature: { type: 'string', nullable: true },
          is_active: { type: 'boolean' },
          address: {
            type: 'string',
            nullable: true,
            description: 'Endereço principal formatado',
          },
          addresses: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoreAddressInput' },
          },
          contacts: {
            type: 'array',
            items: { $ref: '#/components/schemas/StoreContactInput' },
          },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
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
                  role: {
                    type: 'string',
                    enum: ['admin', 'owner', 'attendant'],
                    example: 'attendant',
                  },
                  store_id: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Usuário criado com sucesso' },
          409: { description: 'E-mail já existe' },
        },
      },
    },
    '/api/users/{id}': {
      get: {
        summary: 'Buscar usuário por ID',
        tags: ['Users'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Dados do usuário' },
          404: { description: 'Usuário não encontrado' },
        },
      },
      put: {
        summary: 'Atualizar usuário',
        tags: ['Users'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'owner', 'attendant'] },
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
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
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
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
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
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Excluída com sucesso' } },
      },
    },

    // ==========================================
    // STORES (LOJAS)
    // ==========================================
    '/api/stores': {
      get: {
        summary: 'Listar lojas',
        description:
          'Retorna as lojas com endereço principal, endereços e contatos vinculados. Requer perfil admin ou owner.',
        tags: ['Stores'],
        parameters: [
          {
            in: 'query',
            name: 'showInactive',
            schema: { type: 'boolean' },
            required: false,
            description: 'Quando true, inclui também as lojas inativas',
          },
        ],
        responses: {
          200: { description: 'Lista de lojas retornada com sucesso' },
          401: { description: 'Não autenticado' },
          403: { description: 'Sem permissão (apenas admin/owner)' },
        },
      },
      post: {
        summary: 'Cadastrar nova loja',
        description:
          'Cria a loja e, se informados, vincula contatos e endereços via store_id. Requer perfil admin ou owner.',
        tags: ['Stores'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StoreInput' },
            },
          },
        },
        responses: {
          201: { description: 'Loja criada com sucesso' },
          400: { description: 'Dados inválidos (nome, CNPJ, CPF ou contatos)' },
          401: { description: 'Não autenticado' },
          403: { description: 'Sem permissão (apenas admin/owner)' },
        },
      },
    },
    '/api/stores/for-transfer': {
      get: {
        summary: 'Listar lojas disponíveis para transferência',
        description:
          'Retorna todas as lojas ativas, exceto a do usuário logado. Acessível por qualquer usuário autenticado com loja associada.',
        tags: ['Stores'],
        responses: {
          200: { description: 'Lista de lojas retornada com sucesso' },
          400: { description: 'Usuário não possui loja associada' },
          401: { description: 'Não autenticado' },
        },
      },
    },
    '/api/stores/{id}': {
      get: {
        summary: 'Buscar loja por ID',
        description: 'Retorna a loja com todos os endereços e contatos vinculados.',
        tags: ['Stores'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Dados da loja' },
          404: { description: 'Loja não encontrada' },
        },
      },
      put: {
        summary: 'Atualizar loja (parcial)',
        description:
          'Atualização parcial: apenas os campos enviados são alterados. Se os arrays contacts ou addresses forem enviados, eles substituem completamente os registros vinculados (sincronização); se omitidos, são mantidos.',
        tags: ['Stores'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StoreInput' },
            },
          },
        },
        responses: {
          200: { description: 'Loja atualizada com sucesso' },
          400: { description: 'Dados inválidos' },
          404: { description: 'Loja não encontrada' },
        },
      },
    },
    '/api/stores/{id}/active': {
      patch: {
        summary: 'Ativar/Inativar loja',
        description: 'Alterna o status is_active da loja. Requer perfil admin ou owner.',
        tags: ['Stores'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Status da loja alterado com sucesso' },
          404: { description: 'Loja não encontrada' },
        },
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
          {
            in: 'query',
            name: 'category_id',
            schema: { type: 'string', format: 'uuid' },
            required: false,
            description: 'Filtrar por categoria',
          },
          {
            in: 'query',
            name: 'status',
            schema: { type: 'string', enum: ['available', 'reserved', 'rented', 'laundry'] },
            required: false,
          },
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
                  rental_price: { type: 'number', example: 1500.0 },
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
            schema: {
              type: 'string',
              enum: ['budget', 'reserved', 'picked_up', 'returned', 'late', 'cancelled'],
            },
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
                  start_date: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Data/hora de retirada programada',
                  },
                  fitting_date: {
                    type: 'string',
                    format: 'date-time',
                    nullable: true,
                    description:
                      'Data/hora da prova do traje (opcional). Deve ser anterior ou igual à data de retirada.',
                  },
                  end_date_scheduled: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Data/hora de devolução programada',
                  },
                  status: {
                    type: 'string',
                    enum: ['budget', 'reserved'],
                    default: 'reserved',
                    description: 'budget = orçamento, reserved = reserva confirmada',
                  },
                  discount: {
                    type: 'number',
                    example: 0,
                    minimum: 0,
                    description: 'Desconto em valor absoluto',
                  },
                  notes: { type: 'string', description: 'Observações internas' },
                  delivery_address_id: {
                    type: 'string',
                    format: 'uuid',
                    nullable: true,
                    description: 'ID do endereço de entrega (opcional)',
                  },
                  delivery_type: {
                    type: 'string',
                    enum: ['pickup_store', 'delivery', 'shipping'],
                    default: 'pickup_store',
                    description: 'Tipo de entrega/retirada',
                  },
                  laundry_days_needed: {
                    type: 'integer',
                    default: 2,
                    minimum: 0,
                    description: 'Dias necessários para lavanderia após devolução',
                  },
                  store_id: {
                    type: 'string',
                    format: 'uuid',
                    description:
                      'ID da loja. Obrigatório se o usuário logado não tiver store_id associado no token JWT. Preenchido automaticamente se o usuário (attendant) pertencer a uma loja.',
                  },
                  user_id: {
                    type: 'string',
                    format: 'uuid',
                    description:
                      'ID do vendedor. Preenchido automaticamente pelo usuário autenticado (req.user.id).',
                  },
                  installments_config: {
                    type: 'object',
                    description: 'Configuração de parcelamento (ignorado se status=budget)',
                    properties: {
                      count: {
                        type: 'integer',
                        example: 3,
                        minimum: 1,
                        description: 'Número de parcelas',
                      },
                      first_due_date: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Data do primeiro vencimento',
                      },
                    },
                  },
                },
              },
              example: {
                customer_id: '01eeaebf-9a1d-4b7e-ba26-fd00d8af1632',
                products: [
                  { id: '027379fa-8492-4680-bbb8-a2c813860865', quantity: 1 },
                  { id: '6d0e63b3-155c-4893-b36d-d0bdb99a7a7b', quantity: 1 },
                ],
                start_date: '2026-08-15 10:00:00',
                fitting_date: '2026-08-10 14:00:00',
                end_date_scheduled: '2026-08-20 18:00:00',
                status: 'reserved',
                discount: 100.0,
                notes: 'Cliente prefere retirada na loja centro',
                delivery_type: 'pickup_store',
                laundry_days_needed: 2,
                store_id: 'a6763a6f-09df-46bf-b076-1c553e76e3ec',
                installments_config: {
                  count: 3,
                  first_due_date: '2026-09-05 00:00:00',
                },
              },
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
                        total_amount: { type: 'number', example: 1400.0 },
                        status: { type: 'string', example: 'reserved' },
                      },
                    },
                  },
                },
              },
            },
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
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Detalhes do aluguel' },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
      put: {
        summary: 'Editar aluguel (Apenas orçamentos ou reservas antes da retirada)',
        tags: ['Rentals'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  discount: {
                    type: 'number',
                    minimum: 0,
                    description: 'Desconto em valor absoluto',
                  },
                  notes: { type: 'string' },
                  end_date_scheduled: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Nova data de devolução programada',
                  },
                  start_date: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Nova data de retirada programada',
                  },
                  fitting_date: {
                    type: 'string',
                    format: 'date-time',
                    nullable: true,
                    description:
                      'Nova data/hora da prova do traje. Envie null para limpar; omita para manter a atual.',
                  },
                  delivery_type: {
                    type: 'string',
                    enum: ['pickup_store', 'delivery', 'shipping'],
                    description: 'Tipo de entrega/retirada',
                  },
                  delivery_address_id: {
                    type: 'string',
                    format: 'uuid',
                    nullable: true,
                    description: 'ID do endereço de entrega',
                  },
                  laundry_days_needed: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Dias necessários para lavanderia',
                  },
                  status: {
                    type: 'string',
                    enum: ['budget', 'reserved'],
                    description: 'Apenas para orçamentos/reservas (não altera para picked_up)',
                  },
                  products: {
                    type: 'array',
                    description: 'Substitui todos os itens do aluguel',
                    items: {
                      type: 'object',
                      required: ['id'],
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        quantity: { type: 'integer', minimum: 1, default: 1 },
                      },
                    },
                  },
                },
              },
              example: {
                discount: 50.0,
                end_date_scheduled: '2026-08-25 18:00:00',
                delivery_type: 'delivery',
                delivery_address_id: 'c3d4e5f6-5717-4562-b3fc-2c963f66afa6',
                products: [
                  { id: 'a1b2c3d4-5717-4562-b3fc-2c963f66afa6', quantity: 1 },
                  { id: 'e5f6g7h8-5717-4562-b3fc-2c963f66afa6', quantity: 1 },
                ],
              },
            },
          },
        },
        responses: {
          200: { description: 'Aluguel atualizado com sucesso' },
          400: {
            description:
              'Aluguel finalizado/cancelado, ou tentativa de alterar itens/datas/status de um aluguel retirado ou atrasado (apenas multa, desconto e observações são permitidos)',
          },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
    '/api/rentals/{id}/pickup': {
      post: {
        summary: 'Confirmar retirada do traje (Muda status para picked_up)',
        tags: ['Rentals'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
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
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['new_end_date'],
                properties: {
                  new_end_date: {
                    type: 'string',
                    format: 'date-time',
                    description:
                      'Nova data de devolução programada (formato MySQL: YYYY-MM-DD HH:MM:SS)',
                  },
                  extra_amount: {
                    type: 'number',
                    description: 'Valor adicional cobrado pela prorrogação',
                  },
                },
              },
              example: {
                new_end_date: '2026-08-30 18:00:00',
                extra_amount: 150.0,
              },
            },
          },
        },
        responses: {
          200: { description: 'Aluguel prorrogado com sucesso' },
          400: {
            description:
              'Não é possível prorrogar: aluguel não está em andamento (status deve ser picked_up ou late), data inválida ou aluguel não encontrado.',
          },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
    '/api/rentals/{id}/return': {
      post: {
        summary: 'Registrar devolução (Envia produtos para status laundry)',
        tags: ['Rentals'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  penalty_fee: {
                    type: 'number',
                    description: 'Multa por atraso ou dano (opcional)',
                  },
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
                    message: {
                      type: 'string',
                      example: 'Devolução registrada. Produtos enviados para lavanderia.',
                    },
                    penaltyFee: {
                      type: 'number',
                      example: 150.0,
                      description: 'Multa calculada por atraso (se houver)',
                    },
                  },
                },
              },
            },
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
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Aluguel cancelado e produtos liberados.' },
          400: {
            description:
              'Não é possível cancelar aluguel em andamento (picked_up, late) ou finalizado.',
          },
          403: { description: 'Acesso negado - aluguel de outra loja' },
          404: { description: 'Aluguel não encontrado' },
        },
      },
    },
    // ==========================================
    // PAYMENT RECEIPTS
    // ==========================================
    '/api/payments/{id}/receipt': {
      post: {
        summary: 'Emitir recibo de pagamento (PDF assinado enviado via WhatsApp ou para impressão)',
        description:
          'Gera o PDF do recibo de um pagamento confirmado, assina com o assinador configurado (PDF_SIGNER), registra na tabela receipts e tenta entregar ao cliente via WhatsApp. Com sendWhatsApp=false a entrega é ignorada e o PDF assinado é retornado (application/pdf) para impressão.',
        tags: ['Payments'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  sendWhatsApp: {
                    type: 'boolean',
                    default: true,
                    description:
                      'false para pular o envio via WhatsApp e receber o PDF para impressão',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              'Recibo emitido com sucesso. Com WhatsApp: retorna receiptId e whatsappDeliveryStatus (sent|failed). Sem WhatsApp: retorna o PDF assinado (application/pdf) com o header X-Receipt-Id.',
          },
          404: { description: 'Pagamento não encontrado.' },
          422: { description: 'Pagamento cancelado — não é possível emitir recibo.' },
          500: { description: 'Erro ao emitir recibo.' },
        },
      },
    },
    '/api/payments/{id}/receipts': {
      get: {
        summary: 'Listar recibos emitidos de um pagamento',
        tags: ['Payments'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Lista de recibos do pagamento.' },
          404: { description: 'Pagamento não encontrado.' },
        },
      },
    },
    // ==========================================
    // RENTAL CONTRACTS
    // ==========================================
    '/api/rentals/{id}/contract': {
      get: {
        summary: 'Buscar o contrato assinado mais recente de um aluguel',
        description:
          'Retorna os metadados do contrato assinado mais recente do aluguel, incluindo o id usado para visualizar, imprimir e enviar o PDF assinado.',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Contrato encontrado. Retorna data.id, data.issued_at e data.pdf_url.',
          },
          404: { description: 'Nenhum contrato gerado para este aluguel.' },
          500: { description: 'Erro ao buscar o contrato do aluguel.' },
        },
      },
      post: {
        summary: 'Gerar contrato de locação com assinatura digital da locatária',
        description:
          'Fluxo de compatibilidade: gera o draft, persiste no R2, assina e persiste o PDF definitivo no R2. Prefira POST /api/contracts/generate seguido de POST /api/contracts/{id}/sign.',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['lessee_signature'],
                properties: {
                  lessee_signature: {
                    type: 'string',
                    description:
                      'Assinatura da locatária como data URL (data:image/png;base64,...)',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              'Contrato gerado com sucesso. Retorna data.id (id do contrato) e data.pdf_url (/api/contracts/{id}/pdf).',
          },
          400: { description: 'Assinatura ausente ou inválida.' },
          404: { description: 'Aluguel não encontrado.' },
          422: { description: 'Aluguel cancelado — não é possível gerar contrato.' },
          500: { description: 'Erro ao gerar contrato.' },
        },
      },
    },
    '/api/rentals/{id}/contract/send-whatsapp': {
      post: {
        summary: 'Enviar a prévia do contrato (não assinado) via WhatsApp (PDF)',
        description:
          'Renderiza o PDF do contrato sem a assinatura da locatária e o envia ao cliente pelo WhatsApp, permitindo que ele leia o documento antes de assinar no tablet.',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone'],
                properties: { phone: { type: 'string', example: '12999998888' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Retorna data.whatsappDeliveryStatus (sent|failed).',
          },
          400: { description: 'Telefone não informado.' },
          404: { description: 'Aluguel não encontrado.' },
          422: { description: 'Aluguel cancelado — não é possível enviar a prévia.' },
          500: { description: 'Erro ao enviar a prévia do contrato.' },
        },
      },
    },
    '/api/rentals/{id}/contract/send-email': {
      post: {
        summary: 'Enviar a prévia do contrato (não assinado) por e-mail (PDF anexo)',
        description:
          'Renderiza o PDF do contrato sem a assinatura da locatária e o envia ao e-mail do cliente, permitindo que ele leia o documento antes de assinar no tablet.',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Retorna data.emailDeliveryStatus (sent|failed).' },
          400: { description: 'E-mail não informado.' },
          404: { description: 'Aluguel não encontrado.' },
          422: { description: 'Aluguel cancelado — não é possível enviar a prévia.' },
          500: { description: 'Erro ao enviar a prévia do contrato.' },
        },
      },
    },
    '/api/rentals/{id}/contract/preview/pdf': {
      get: {
        summary: 'Baixar o PDF da prévia do contrato (não assinado)',
        description:
          'Renderiza o PDF do contrato sem a assinatura da locatária para leitura antes da assinatura no tablet.',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'PDF da prévia do contrato (application/pdf), inline.',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          404: { description: 'Aluguel não encontrado.' },
          422: { description: 'Aluguel cancelado — não é possível gerar a prévia.' },
          500: { description: 'Erro ao gerar a prévia do contrato.' },
        },
      },
    },
    '/api/rentals/{id}/contract/pdf': {
      get: {
        summary: 'Baixar o PDF do contrato mais recente de um aluguel',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'PDF do contrato mais recente do aluguel (application/pdf), inline.',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          404: { description: 'Nenhum contrato gerado para este aluguel.' },
        },
      },
    },
    '/api/contracts/generate': {
      post: {
        summary: 'Gerar o PDF original (draft) do contrato e persistir no R2',
        description:
          'Gera o número sequencial do contrato (PREFIXO-AAAA-0001) em uma transação com SELECT ... FOR UPDATE, injeta o número no cabeçalho do PDF, calcula o hash SHA-256 e armazena o arquivo original no Cloudflare R2 (draft_pdf_path). O contrato fica com status pending_signature, aguardando a assinatura no tablet.',
        tags: ['Contracts'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rental_id'],
                properties: {
                  rental_id: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              'Draft gerado. Retorna data.id, data.contract_number, data.status, data.document_hash, data.draft_pdf_path e data.draft_pdf_url.',
          },
          400: { description: 'Aluguel não informado.' },
          404: { description: 'Aluguel não encontrado.' },
          422: { description: 'Aluguel cancelado.' },
          500: { description: 'Erro ao gerar o contrato.' },
        },
      },
    },
    '/api/contracts/{id}/sign': {
      post: {
        summary: 'Assinar o contrato e persistir o PDF definitivo no R2',
        description:
          'Baixa o PDF original do R2, valida o hash SHA-256, insere a assinatura da locatária na última página, armazena o PDF definitivo no R2 (signed_pdf_path) e registra signed_at, signer_ip e device_user_agent. Em seguida dispara o envio automático por WhatsApp e e-mail quando houver contatos cadastrados.',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['lessee_signature'],
                properties: {
                  lessee_signature: {
                    type: 'string',
                    description:
                      'Assinatura da locatária como data URL (data:image/png;base64,...)',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              'Contrato assinado. Retorna data.contract_number, data.status, data.document_hash, data.signed_at, data.signer_ip, data.device_user_agent, data.signed_pdf_path e data.pdf_url.',
          },
          400: { description: 'Assinatura ausente ou inválida.' },
          404: { description: 'Contrato não encontrado.' },
          409: { description: 'Contrato já assinado ou draft indisponível/integro.' },
          422: { description: 'Aluguel cancelado.' },
          500: { description: 'Erro ao assinar o contrato.' },
        },
      },
    },
    '/api/contracts/{id}/cancel': {
      post: {
        summary: 'Cancelar um contrato',
        description:
          'Cancela o contrato, altera o status para cancelled e registra o motivo em notes. Permitido para admin, owner e local_manager. O contrato cancelado mantém seus PDFs e hash para auditoria, e um novo contrato pode ser emitido para o mesmo aluguel.',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['notes'],
                properties: {
                  notes: {
                    type: 'string',
                    maxLength: 2000,
                    description: 'Motivo do cancelamento do contrato.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              'Contrato cancelado. Retorna data.id, data.contract_number, data.status e data.notes.',
          },
          400: { description: 'Motivo do cancelamento ausente ou inválido.' },
          403: { description: 'Perfil sem permissão para cancelar contratos.' },
          404: { description: 'Contrato não encontrado.' },
          409: { description: 'Contrato já cancelado.' },
          500: { description: 'Erro ao cancelar o contrato.' },
        },
      },
    },
    '/api/contracts/{id}/pdf': {
      get: {
        summary: 'Baixar o PDF assinado do contrato',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'PDF do contrato (application/pdf), inline.',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          404: { description: 'Contrato não encontrado.' },
          500: { description: 'Erro ao baixar o contrato.' },
        },
      },
    },
    '/api/contracts/{id}/send-email': {
      post: {
        summary: 'Enviar o contrato assinado por e-mail (PDF anexo)',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Contrato enviado. Retorna data.emailDeliveryStatus (sent).' },
          400: { description: 'E-mail não informado.' },
          404: { description: 'Contrato não encontrado.' },
          502: { description: 'Falha na entrega do e-mail.' },
        },
      },
    },
    '/api/contracts/{id}/send-whatsapp': {
      post: {
        summary: 'Enviar o contrato assinado via WhatsApp (PDF)',
        tags: ['Contracts'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone'],
                properties: { phone: { type: 'string', example: '12999998888' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Retorna data.whatsappDeliveryStatus (sent|failed).',
          },
          400: { description: 'Telefone não informado.' },
          404: { description: 'Contrato não encontrado.' },
        },
      },
    },
  },
};

module.exports = swaggerDocument;
