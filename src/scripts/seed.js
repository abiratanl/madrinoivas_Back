const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  console.log('🌱 Iniciando Seed do Banco de Dados...');
  const conn = await db.getConnection();

  try {
    // 1. Limpeza (Desativa verificação de chave estrangeira para limpar tudo)
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('🧹 Limpando tabelas antigas...');
    
    const tables = [
      'payments', 'installments', 'rental_items', 'rentals', 
      'products', 'categories', 'users', 'stores', 
      'contacts', 'addresses', 'customers'
    ];
    
    for (const table of tables) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
    
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // 2. Criar 3 LOJAS
    console.log('🏢 Criando 3 Lojas...');
    const stores = [
      { id: uuidv4(), name: 'Loja Matriz (Centro)', code: 'MTZ' },
      { id: uuidv4(), name: 'Filial Shopping', code: 'SHP' },
      { id: uuidv4(), name: 'Quiosque Bairro', code: 'QSK' }
    ];

    for (const s of stores) {
      await conn.query('INSERT INTO stores (id, name, phone) VALUES (?, ?, ?)', [s.id, s.name, '11999999999']);
    }

    // 3. Criar 3 USUÁRIOS (Senha padrão: 123456)
    console.log('bust👤 Criando 3 Usuários...');
    const hashedPassword = await bcrypt.hash('123456', 10);
    const users = [
      { id: uuidv4(), name: 'Admin Matriz', email: 'admin@teste.com', role: 'admin', store_id: stores[0].id },
      { id: uuidv4(), name: 'Gerente Shopping', email: 'gerente@teste.com', role: 'owner', store_id: stores[1].id },
      { id: uuidv4(), name: 'Vendedor Bairro', email: 'vendedor@teste.com', role: 'attendant', store_id: stores[2].id }
    ];

    for (const u of users) {
      await conn.query(
        'INSERT INTO users (id, name, email, password, role, store_id) VALUES (?, ?, ?, ?, ?, ?)',
        [u.id, u.name, u.email, hashedPassword, u.role, u.store_id]
      );
    }

    // 4. Criar 3 CATEGORIAS
    console.log('🏷️ Criando 3 Categorias...');
    const categories = [
      { id: uuidv4(), name: 'Vestidos de Noiva' },
      { id: uuidv4(), name: 'Ternos Slim' },
      { id: uuidv4(), name: 'Acessórios de Luxo' }
    ];

    for (const c of categories) {
      // CORREÇÃO: Removido 'slug'
      await conn.query('INSERT INTO categories (id, name) VALUES (?, ?)', [c.id, c.name]);
    }

    // 5. Criar 3 PRODUTOS
    console.log('👗 Criando 3 Produtos...');
    const products = [
      { 
        id: uuidv4(), name: 'Vestido Sereia Branco', rental_price: 1500.00, 
        store_id: stores[0].id, category_id: categories[0].id, code: 'NOIVA-01' 
      },
      { 
        id: uuidv4(), name: 'Terno Azul Marinho', rental_price: 450.00, 
        store_id: stores[1].id, category_id: categories[1].id, code: 'TERNO-01' 
      },
      { 
        id: uuidv4(), name: 'Tiara de Cristal', rental_price: 80.00, 
        store_id: stores[2].id, category_id: categories[2].id, code: 'ACESS-01' 
      }
    ];

    for (const p of products) {
      await conn.query(
        `INSERT INTO products (id, name, rental_price, store_id, category_id, code, status) 
         VALUES (?, ?, ?, ?, ?, ?, 'available')`,
        [p.id, p.name, p.rental_price, p.store_id, p.category_id, p.code]
      );
    }

    // 6. Criar 3 CLIENTES (Com Endereço e Contato)
    console.log('🤝 Criando 3 Clientes...');
    const customers = [
      { id: uuidv4(), name: 'Maria da Silva', cpf: '111.111.111-11' },
      { id: uuidv4(), name: 'João Souza', cpf: '222.222.222-22' },
      { id: uuidv4(), name: 'Ana Pereira', cpf: '333.333.333-33' }
    ];

    for (const cus of customers) {
      // Inserir Cliente
      await conn.query(
        'INSERT INTO customers (id, name, cpf) VALUES (?, ?, ?)',
        [cus.id, cus.name, cus.cpf]
      );
      
      // Inserir Contato (Para aparecer na listagem)
      await conn.query(
        "INSERT INTO contacts (id, customer_id, type, value, is_primary) VALUES (?, ?, 'whatsapp', '11900000000', 1)",
        [uuidv4(), cus.id]
      );
      
      // Inserir Endereço
      await conn.query(
        "INSERT INTO addresses (id, customer_id, type, zip_code, street, number, city, state, is_default) VALUES (?, ?, 'residential', '12000000', 'Rua Exemplo', '100', 'Cidade Teste', 'SP', 1)",
        [uuidv4(), cus.id]
      );
    }

    console.log('✅ SEED CONCLUÍDO COM SUCESSO!');
    console.log('------------------------------------------------');
    console.log(`🔑 Login Admin:    ${users[0].email} | Senha: 123456 (Loja 1)`);
    console.log(`🔑 Login Owner:    ${users[1].email} | Senha: 123456 (Loja 2)`);
    console.log(`🔑 Login Attendant: ${users[2].email} | Senha: 123456 (Loja 3)`);
    console.log('------------------------------------------------');
    process.exit(0);

  } catch (error) {
    console.error('❌ Erro no seed:', error);
    process.exit(1);
  } finally {
    conn.release();
  }
}

seed();