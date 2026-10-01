// tests/password_reset.test.js
require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const testUser = {
  id: uuidv4(),
  store_id: null, // Importante: Admin/Cliente global sem loja
  name: 'Reset Test User',
  email: 'reset.test@example.com',
  password: 'oldpassword123',
  role: 'customer',
};

let authToken;
let resetToken;

describe('PASSWORD RESET & ME PROFILE TESTS', () => {
  beforeAll(async () => {
    // 1. Limpeza
    if (db && db.query) {
      await db.query('DELETE FROM users WHERE email = ?', [testUser.email]);
    }

    // 2. Criar usuário no banco
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    
    // Adicionei store_id aqui para garantir compatibilidade
    const insertQuery = `
      INSERT INTO users (id, store_id, name, email, password, role, is_active, must_change_password) 
      VALUES (?, ?, ?, ?, ?, ?, true, false)
    `;
    
    await db.query(insertQuery, [
      testUser.id,
      testUser.store_id,
      testUser.name,
      testUser.email,
      hashedPassword,
      testUser.role,
    ]);

    // 3. Logar para pegar o Token JWT
    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    authToken = res.body.token;
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE email = ?', [testUser.email]);
    // await db.end(); 
  });

  it('Should GET /me profile using token', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.email).toBe(testUser.email);
    expect(res.body.data.id).toBe(testUser.id);
  });

  it('Should request a password reset token (Forgot Password)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: testUser.email,
    });

    expect(res.statusCode).toBe(200);
    // Ajustado para inglês ou português genérico
    expect(res.body.message).toMatch(/(email|sent)/i); 

    // Recuperar o token gerado no banco para o próximo teste
    const [rows] = await db.query(
      'SELECT password_reset_token FROM users WHERE email = ?',
      [testUser.email]
    );
    // Precisamos do token "cru" (raw), mas no banco ele está hash.
    // Como o controller apenas simula o envio no console.log,
    // num teste real de integração black-box, seria difícil pegar o token raw sem interceptar o email.
    // PROVISÓRIO: Vamos pegar o token do console ou assumir que o teste unitário cobre isso.
    // Para este teste de ponta a ponta funcionar sem mock de email, precisaríamos expor o token na resposta em modo de teste
    // OU (hack) resetar manualmente no banco para um token conhecido.
    
    // HACK PARA TESTE: Definir um token conhecido no banco para testar o reset
    const crypto = require('crypto');
    const mockRawToken = 'my-secret-reset-token';
    const hashedToken = crypto.createHash('sha256').update(mockRawToken).digest('hex');
    
    await db.query(
      'UPDATE users SET password_reset_token = ?, password_reset_expires = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?',
      [hashedToken, testUser.id]
    );
    
    resetToken = mockRawToken; 
  });

  it('Should reset password using the token from DB', async () => {
    const newPassword = 'newpassword123';
    
    const res = await request(app)
      .post(`/api/auth/reset-password/${resetToken}`)
      .send({
        password: newPassword,
      });

    expect(res.statusCode).toBe(200);
    
    // === CORREÇÃO DO ERRO ===
    // O controller agora retorna inglês: "Password changed successfully..."
    // Mudamos o regex para aceitar "success" ou "sucesso"
    expect(res.body.message).toMatch(/(success|sucesso)/i);

    // 3. Verificar login com a NOVA senha
    const loginRes = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: newPassword,
    });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });
});