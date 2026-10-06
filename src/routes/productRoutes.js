const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const transferController = require('../controllers/transferController');
const { protect } = require('../middlewares/authMiddleware');

// 1. Importamos os middlewares de imagem
const { uploadArray, optimizeAndUploadImages } = require('../middlewares/imageMiddleware');

// --- ÁREA PÚBLICA (Sugestão) ---
// router.get('/featured', productController.getFeaturedProducts); (Será implementada para exibição de imagens na Home)

// --- ÁREA RESTRITA (Painel Administrativo) ---
// Todas as rotas abaixo exigem token de autenticação
router.use(protect);

// Rotas de Leitura
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);

// Rota de Criação (POST)
// Fluxo: Recebe arquivos -> Otimiza/Sobe R2 -> Controller salva no BD
router.post('/', 
    uploadArray,             // Middleware do Multer (recebe 'photos')
    optimizeAndUploadImages, // Middleware do Sharp/R2 (gera thumbnails e full)
    productController.createProduct 
);

// Rota de Atualização (PUT)
// Também precisa aceitar imagens caso o usuário esteja adicionando fotos novas
router.put('/:id', 
    uploadArray, 
    optimizeAndUploadImages, 
    productController.updateProduct 
);

router.delete('/:id', productController.deleteProduct);

// --- ROTAS DE TRANSFERÊNCIA (Frontend: POST /products/:id/transfer e /products/:id/receive) ---
router.post('/:productId/transfer', transferController.requestTransferFromProduct);
router.post('/:productId/receive', transferController.receiveTransferFromProduct);
router.get('/:productId/transfers', transferController.getTransfersByProduct);

module.exports = router;