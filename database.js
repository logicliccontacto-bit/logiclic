require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no está definida. Configúrala en .env (local) o en las variables de entorno del hosting.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Users table ready');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      service TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'Pendiente',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Contact requests table ready');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS casillero_requests (
      id SERIAL PRIMARY KEY,
      nombre_completo TEXT NOT NULL,
      tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('Cédula','Cédula de Extranjería','Pasaporte','NIT')),
      numero_documento TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      ciudad TEXT NOT NULL,
      tipo_importacion TEXT,
      status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Aprobada','Rechazada')),
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_casillero_requests_pending_documento
      ON casillero_requests (numero_documento) WHERE status = 'Pendiente'
  `);
  console.log('Casillero requests table ready');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS casilleros (
      id SERIAL PRIMARY KEY,
      source_request_id INTEGER UNIQUE REFERENCES casillero_requests(id) ON DELETE SET NULL,
      codigo TEXT UNIQUE NOT NULL,
      nombre_completo TEXT NOT NULL,
      tipo_documento TEXT NOT NULL,
      numero_documento TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      telefono TEXT NOT NULL,
      ciudad TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Casilleros table ready');

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count === 0) {
    const defaultAdmin = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD;

    if (!defaultPassword) {
      console.warn('ADMIN_PASSWORD no está definida: no se pudo crear el usuario admin. Defínela en .env o en las variables de entorno del hosting y reinicia.');
      return;
    }

    const passHash = hashPassword(defaultPassword);
    await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
      [defaultAdmin, passHash]
    );
    console.log(`Usuario admin creado: ${defaultAdmin}`);
  }
}

module.exports = {
  pool,
  hashPassword,
  initDatabase
};
