const Product = require('../models/ProductModel');

exports.getAllProducts = async (req, res) => {
  try {
    const filters = {};
    
    // ============================================================
    // LÓGICA DE FILTRO DE LOJA (CORRIGIDA)
    // ============================================================
    
    // 1. Verifica se é Busca Global (Aceita 'true' string ou true boolean)
    const isGlobal = req.query.global_search === 'true' || req.query.global_search === true;

    if (isGlobal) {
        // Se for global, NÃO adicionamos store_id ao filtro.
        // Isso fará o banco trazer produtos de todas as lojas.
        // (Futuramente, adicione aqui: if (req.user.role !== 'admin') return erro...)
        console.log(`[BUSCA GLOBAL] Usuário ${req.user.id} visualizando todas as lojas.`);
    } else {
        // 2. Se NÃO for global, aplicamos as restrições padrão:
        
        // Se o usuário tem loja fixa (Gerente/Vendedor), ele só vê a loja dele.
        if (req.user.storeId) {
            filters.store_id = req.user.storeId;
        }
        
        // Se for Admin (sem loja fixa) e quiser filtrar por uma específica via Dropdown
        else if (req.query.store_id) {
            filters.store_id = req.query.store_id;
        }
    }

    // ============================================================
    // OUTROS FILTROS
    // ============================================================
    
    if (req.query.category_id) filters.category_id = req.query.category_id;
    if (req.query.status) filters.status = req.query.status;
    
    // Filtro para Home Page (Destaques)
    if (req.query.is_featured) filters.is_featured = (req.query.is_featured === 'true');

    // Busca no Model (que já faz o JOIN com imagens e categorias)
    const products = await Product.findAll(filters);
    
    res.status(200).json({ status: 'success', results: products.length, data: products });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar produtos.' });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Busca dados do produto
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Produto não encontrado.' });
    }

    // Segurança: Bloqueia acesso entre lojas (exceto se for busca global ou admin)
    // Se o usuário tem loja fixa e o produto é de outra loja -> Bloqueia
    if (req.user.storeId && product.store_id !== req.user.storeId) {
      return res.status(403).json({ status: 'error', message: 'Acesso negado a este produto.' });
    }

    // 2. Busca as imagens da galeria
    const images = await Product.getImagesByProductId(id);

    // Retorna o produto com o array de imagens dentro
    res.status(200).json({ 
        status: 'success', 
        data: {
            ...product, 
            images: images 
        } 
    });
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { 
      category_id, code, name, description, 
      size, color, brand, purchase_price, rental_price, 
      status, store_id, is_featured 
    } = req.body;

    // Validações Básicas
    if (!name || !rental_price || !code) {
      return res.status(400).json({ status: 'error', message: 'Nome, Código e Preço são obrigatórios.' });
    }

    // --- LÓGICA DE PERMISSÃO DE LOJA (MUDANÇA AQUI) ---
    let finalStoreId;

    // Verifique como você salvou o role no token JWT (pode ser 'admin', 'owner', 'superadmin')
    const isAdmin = req.user.role === 'admin' || req.user.role === 'owner';

    if (isAdmin) {
        // Se é Admin, ele TEM que mandar o store_id pelo dropdown
        if (!store_id) {
            return res.status(400).json({ status: 'error', message: 'Administradores devem selecionar a Loja.' });
        }
        finalStoreId = store_id;
    } else {
        // Se é Funcionário, ignoramos o dropdown e forçamos a loja dele
        finalStoreId = req.user.storeId;
    }

    // 1. Cria o Produto
    const newProductId = await Product.create({
      store_id: finalStoreId,
      category_id,
      code,
      name,
      description,
      size,
      color,           
      brand,           
      purchase_price,  
      rental_price,    
      status,
      is_featured: is_featured === 'true' || is_featured === true ? 1 : 0
    });

    // 2. Salva as imagens (Se houver upload processado pelo middleware)
    if (req.processedImages && req.processedImages.length > 0) {
        await Product.addImages(newProductId, req.processedImages);
    }

    res.status(201).json({ 
        status: 'success', 
        message: 'Produto cadastrado com sucesso!',
        productId: newProductId 
    });

  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao criar produto.' });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar existência
    const existingProduct = await Product.findById(id);
    if (!existingProduct) return res.status(404).json({ message: 'Produto não encontrado.' });

    // Verificar permissão de loja
    if (req.user.storeId && existingProduct.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Você não tem permissão para editar este produto.' });
    }

    // 1. Atualiza dados de texto
    const updated = await Product.update(id, req.body);

    // 2. Se houver NOVAS fotos, adiciona (não apaga as antigas aqui)
    if (req.processedImages && req.processedImages.length > 0) {
        await Product.addImages(id, req.processedImages);
    }

    res.status(200).json({ status: 'success', message: 'Produto atualizado com sucesso.' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao atualizar produto.' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await Product.findById(id);
    if (!existingProduct) return res.status(404).json({ message: 'Produto não encontrado.' });

    if (req.user.storeId && existingProduct.store_id !== req.user.storeId) {
      return res.status(403).json({ message: 'Você não tem permissão para excluir este produto.' });
    }

    // O delete do produto dispara CASCADE na tabela de imagens
    await Product.delete(id);

    res.status(200).json({ status: 'success', message: 'Produto removido com sucesso.' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao deletar produto.' });
  }
};