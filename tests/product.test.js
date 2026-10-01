const request = require('supertest');
const app = require('../src/app');
const ProductModel = require('../src/models/ProductModel');

// --- MOCKS ---

// 1. Mock do Banco de Dados (Model)
jest.mock('../src/models/ProductModel');

// 2. Mock da Autenticação (Simula usuário logado)
jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    // Simulando um ATTENDANT da Loja A
    req.user = { id: 'user-1', role: 'attendant', storeId: 'store-A' };
    next();
  },
  restrictTo: (...roles) => (req, res, next) => next(),
}));

// 3. Mock do Upload de Imagens (NOVO e IMPORTANTE)
// Isso impede que o teste tente usar o S3/R2 ou Sharp de verdade
jest.mock('../src/middlewares/imageUploadMiddleware', () => ({
  // Simula o Multer (passa direto)
  uploadArray: (req, res, next) => next(), 
  
  // Simula o processamento do Sharp/R2
  optimizeAndUploadImages: (req, res, next) => {
    // Injetamos imagens falsas como se o upload tivesse funcionado
    req.processedImages = [
      { id: 'img-1', url_thumb: 'thumb.webp', url_full: 'full.webp', is_main: true }
    ];
    next();
  }
}));

describe('Product API (CRUD & Global Search)', () => {
  
  // Limpa os mocks antes de cada teste para não haver contagem de chamadas errada
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- TESTE DE CRIAÇÃO ---
  it('POST /api/products › Should create product and associate images', async () => {
    const newProductPayload = {
      name: 'Vestido Gala Vermelho',
      code: 'VEST-RED-01',
      rental_price: 250.00,
      store_id: 'store-A',
      is_featured: true
    };

    // Configura o retorno do Mock do Model
    ProductModel.create.mockResolvedValue('new-product-uuid-123'); // Agora retorna apenas o ID
    ProductModel.addImages.mockResolvedValue(); // Simula sucesso ao salvar imagens

    const res = await request(app).post('/api/products').send(newProductPayload);

    // Verificações
    expect(res.statusCode).toBe(201);
    expect(res.body.productId).toBe('new-product-uuid-123');
    
    // Verifica se o Model.create foi chamado corretamente com is_featured convertido
    expect(ProductModel.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Vestido Gala Vermelho',
      is_featured: 1 // O controller converte true -> 1
    }));

    // Verifica se o Model.addImages foi chamado (pois nosso mock de middleware injetou imagens)
    expect(ProductModel.addImages).toHaveBeenCalledWith(
      'new-product-uuid-123', 
      expect.any(Array) // Espera um array de imagens
    );
  });

  // --- TESTE DE BUSCA POR ID (Com Imagens) ---
  it('GET /api/products/:id › Should return product data WITH images', async () => {
    const mockProduct = { id: 'prod-1', name: 'Terno Azul', store_id: 'store-A' };
    const mockImages = [{ url_thumb: 't.webp', is_main: 1 }];

    ProductModel.findById.mockResolvedValue(mockProduct);
    ProductModel.getImagesByProductId.mockResolvedValue(mockImages);

    const res = await request(app).get('/api/products/prod-1');

    expect(res.statusCode).toBe(200);
    // Verifica se a resposta mesclou o produto com o array de imagens
    expect(res.body.data.name).toBe('Terno Azul');
    expect(res.body.data.images).toHaveLength(1);
    expect(res.body.data.images[0].url_thumb).toBe('t.webp');
  });

  // --- TESTE DE BUSCA PADRÃO (Filtro Loja) ---
  it('GET /api/products › Should filter by user storeId by default', async () => {
    ProductModel.findAll.mockResolvedValue([]);

    await request(app).get('/api/products');

    expect(ProductModel.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ store_id: 'store-A' })
    );
  });

  // --- TESTE DE BUSCA GLOBAL ---
  it('GET /api/products?global_search=true › Should IGNORE store filter', async () => {
    ProductModel.findAll.mockResolvedValue([]);

    await request(app).get('/api/products?global_search=true');

    // Recupera os argumentos passados para a função findAll
    const calls = ProductModel.findAll.mock.calls[0][0];
    
    // Garante que store_id NÃO foi passado nos filtros
    expect(calls.store_id).toBeUndefined(); 
  });
});