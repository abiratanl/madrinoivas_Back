const path = require('path');
// This ensures the .env is read from the project root regardless of where the test starts
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');

const getPort = () => {
  // 1. Se estiver em modo TEST, prioriza a porta externa
  if (process.env.NODE_ENV === 'test') {
    return parseInt(process.env.DB_PORT_EXTERNAL) || 3307;
  }

  // Define o nome do serviço (padrão 'db' se a variável não estiver definida)
  const serviceName = process.env.DB_SERVICE_NAME || 'db';

  // 2. Se o host for o nome do serviço Docker, estamos dentro da rede interna
  if (process.env.DB_HOST === serviceName) {
    return 3306;
  }

  // 3. Se o host for local, usamos a porta externa definida no .env
  if (process.env.DB_HOST === '127.0.0.1' && process.env.DB_PORT_EXTERNAL) {
    return parseInt(process.env.DB_PORT_EXTERNAL);
  }

  // 4. Fallback padrão
  return parseInt(process.env.DB_PORT) || 3306;
};

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database:
    process.env.NODE_ENV === 'test' ? process.env.DB_NAME_TEST || 'test_db' : process.env.DB_NAME,
  port: getPort(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
