const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { pool, hashPassword, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Sessions storage in memory (token -> username)
const sessions = new Map();

// Helper to parse cookies manually without cookie-parser dependency
function getSessionToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      acc[key] = value;
    }
    return acc;
  }, {});
  return cookies['session_token'] || null;
}

// Authentication Middleware
function requireAuth(req, res, next) {
  const token = getSessionToken(req);
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  req.username = sessions.get(token);
  next();
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// === TRM (Tasa Representativa del Mercado) ===
const TRM_FALLBACK = 4050; // Actualizar manualmente si la fuente oficial falla por mucho tiempo
const TRM_CACHE_MS = 6 * 60 * 60 * 1000; // 6 horas
const TRM_MANEJO = 500; // Recargo fijo de manejo en COP
let trmCache = { valor: null, fetchedAt: 0 };

async function getTRM() {
  const now = Date.now();
  if (trmCache.valor && (now - trmCache.fetchedAt) < TRM_CACHE_MS) {
    return trmCache.valor;
  }
  try {
    const response = await fetch(
      'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1'
    );
    const data = await response.json();
    const valor = parseFloat(data[0]?.valor);
    if (!isNaN(valor) && valor > 0) {
      trmCache = { valor, fetchedAt: now };
      return valor;
    }
  } catch (err) {
    console.error('Error fetching TRM:', err.message);
  }
  return trmCache.valor || TRM_FALLBACK;
}

// === Casillero requests: simple in-memory rate limiter (mirrors the sessions Map above) ===
const casilleroRateLimit = new Map(); // ip -> timestamps[]
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (casilleroRateLimit.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  casilleroRateLimit.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

const VALID_TIPOS_DOCUMENTO = ['Cédula', 'Cédula de Extranjería', 'Pasaporte', 'NIT'];

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function casilleroDuplicateExists(tipoDocumento, numeroDocumento, email, nombreCompleto) {
  const normalizedName = normalizeName(nombreCompleto);
  const { rows } = await pool.query(
    `SELECT 1 FROM casillero_requests
       WHERE status = 'Pendiente' AND (
         (tipo_documento = $1 AND numero_documento = $2) OR
         email = $3 OR
         lower(regexp_replace(trim(nombre_completo), '\\s+', ' ', 'g')) = $4
       )
     UNION
     SELECT 1 FROM casilleros
       WHERE (tipo_documento = $1 AND numero_documento = $2) OR
         email = $3 OR
         lower(regexp_replace(trim(nombre_completo), '\\s+', ' ', 'g')) = $4
     LIMIT 1`,
    [tipoDocumento, numeroDocumento, email, normalizedName]
  );
  return rows.length > 0;
}

// === Client portal auth (separate namespace from admin sessions/cookies) ===
const clientSessions = new Map(); // token -> casillero_id
const clientLoginRateLimit = new Map(); // ip -> timestamps[]

function isClientLoginRateLimited(ip) {
  const now = Date.now();
  const timestamps = (clientLoginRateLimit.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  clientLoginRateLimit.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function getClientSessionToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
    return acc;
  }, {});
  return cookies['client_session_token'] || null;
}

function requireClientAuth(req, res, next) {
  const token = getClientSessionToken(req);
  if (!token || !clientSessions.has(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  req.casilleroId = clientSessions.get(token);
  next();
}

// === API ENDPOINTS ===

// 0. Get today's TRM + handling fee (only the final value is exposed)
app.get('/api/trm', async (req, res) => {
  try {
    const trm = await getTRM();
    res.json({ valor: Math.round(trm + TRM_MANEJO) });
  } catch (err) {
    res.json({ valor: Math.round(TRM_FALLBACK + TRM_MANEJO) });
  }
});

// 1. Submit contact request
app.post('/api/contact', async (req, res) => {
  const { name, email, service, message } = req.body;
  // The landing page form sends 'company' and optionally 'phone'
  const company = req.body.company || req.body.phone || '';

  if (!name || !email || !service) {
    return res.status(400).json({ success: false, error: 'Name, email, and service are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO contact_requests (name, email, phone, service, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, email, company, service, message || '']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Error inserting request:', err.message);
    res.status(500).json({ success: false, error: 'Database error. Please try again.' });
  }
});

// 2. Admin Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const passHash = hashPassword(password);

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password_hash = $2',
      [username, passHash]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Generate a new secure session token
    const token = crypto.randomUUID();
    sessions.set(token, username);

    // Set session cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error('Login database error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// 3. Admin Logout
app.post('/api/auth/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    sessions.delete(token);
  }
  res.clearCookie('session_token');
  res.json({ success: true });
});

// 4. Check active admin session
app.get('/api/admin/check-session', requireAuth, (req, res) => {
  res.json({ success: true, username: req.username });
});

// 5. Fetch all contact requests (Protected)
app.get('/api/admin/requests', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contact_requests ORDER BY created_at DESC');
    res.json({ success: true, requests: rows });
  } catch (err) {
    console.error('Error fetching requests:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 6. Update request status (Protected)
app.patch('/api/admin/requests/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Pendiente', 'En proceso', 'Completado'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value.' });
  }

  try {
    const result = await pool.query(
      'UPDATE contact_requests SET status = $1 WHERE id = $2',
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating status:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 7. Delete request (Protected)
app.delete('/api/admin/requests/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM contact_requests WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting request:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 8. Submit a casillero request (public)
app.post('/api/casillero-requests', async (req, res) => {
  const { nombre_completo, tipo_documento, numero_documento, email, telefono, ciudad, tipo_importacion, website } = req.body;

  // Honeypot: bots fill hidden fields humans never see
  if (website) {
    return res.json({ success: true, id: 0 });
  }

  if (isRateLimited(req.ip)) {
    return res.status(429).json({ success: false, error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' });
  }

  if (!nombre_completo || !tipo_documento || !numero_documento || !email || !telefono || !ciudad) {
    return res.status(400).json({ success: false, error: 'Completa todos los campos requeridos.' });
  }
  if (!VALID_TIPOS_DOCUMENTO.includes(tipo_documento)) {
    return res.status(400).json({ success: false, error: 'Tipo de documento inválido.' });
  }

  try {
    const duplicate = await casilleroDuplicateExists(tipo_documento, numero_documento, email, nombre_completo);
    if (duplicate) {
      return res.status(409).json({ success: false, error: 'Ya existe una solicitud o cuenta asociada a estos datos.' });
    }

    const result = await pool.query(
      `INSERT INTO casillero_requests (nombre_completo, tipo_documento, numero_documento, email, telefono, ciudad, tipo_importacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [nombre_completo, tipo_documento, numero_documento, email, telefono, ciudad, tipo_importacion || null]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe una solicitud o cuenta asociada a estos datos.' });
    }
    console.error('Error creating casillero request:', err.message);
    res.status(500).json({ success: false, error: 'Database error. Please try again.' });
  }
});

// 9. List casillero requests (Protected)
app.get('/api/admin/casillero-requests', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM casillero_requests ORDER BY created_at DESC');
    res.json({ success: true, requests: rows });
  } catch (err) {
    console.error('Error fetching casillero requests:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 10. Approve a casillero request: creates the casillero account with a sequential code (Protected)
app.patch('/api/admin/casillero-requests/:id/approve', requireAuth, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE casillero_requests SET status = 'Aprobada', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2 AND status = 'Pendiente' RETURNING *`,
      [req.username, id]
    );
    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'La solicitud ya fue procesada.' });
    }
    const r = upd.rows[0];
    const ins = await client.query(
      `INSERT INTO casilleros (source_request_id, codigo, nombre_completo, tipo_documento, numero_documento, email, telefono, ciudad)
       VALUES ($1, '', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [r.id, r.nombre_completo, r.tipo_documento, r.numero_documento, r.email, r.telefono, r.ciudad]
    );
    const codigo = 'LGC-' + String(ins.rows[0].id).padStart(4, '0');
    await client.query('UPDATE casilleros SET codigo = $1 WHERE id = $2', [codigo, ins.rows[0].id]);
    await client.query('COMMIT');
    res.json({ success: true, codigo });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un casillero con ese documento o correo.' });
    }
    console.error('Error approving casillero request:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    client.release();
  }
});

// 11. Reject a casillero request (Protected)
app.patch('/api/admin/casillero-requests/:id/reject', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body;
  try {
    const result = await pool.query(
      `UPDATE casillero_requests SET status = 'Rechazada', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
       WHERE id = $3 AND status = 'Pendiente'`,
      [req.username, rejection_reason || null, id]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ success: false, error: 'La solicitud ya fue procesada.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error rejecting casillero request:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 12. Delete a casillero request (Protected)
app.delete('/api/admin/casillero-requests/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM casillero_requests WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting casillero request:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 13. List casilleros (Protected)
app.get('/api/admin/casilleros', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM casilleros ORDER BY created_at DESC');
    res.json({ success: true, casilleros: rows });
  } catch (err) {
    console.error('Error fetching casilleros:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 14. Update a casillero (partial update) (Protected)
app.patch('/api/admin/casilleros/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const allowedFields = ['nombre_completo', 'telefono', 'ciudad', 'email', 'is_active'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates.push(`${field} = $${i}`);
      values.push(req.body[field]);
      i++;
    }
  }
  if (updates.length === 0) {
    return res.status(400).json({ success: false, error: 'No hay campos para actualizar.' });
  }
  values.push(id);
  try {
    const result = await pool.query(`UPDATE casilleros SET ${updates.join(', ')} WHERE id = $${i}`, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Casillero not found' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un casillero con ese documento o correo.' });
    }
    console.error('Error updating casillero:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 15. Delete a casillero (Protected)
app.delete('/api/admin/casilleros/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM casilleros WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Casillero not found' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ success: false, error: 'Este casillero tiene prealertas registradas. Elimínalas primero para poder borrar la cuenta.' });
    }
    console.error('Error deleting casillero:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 16. Client login: email + numero_documento (their own document number) as password
app.post('/api/client/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Correo y contraseña requeridos.' });
  }

  if (isClientLoginRateLimited(req.ip)) {
    return res.status(429).json({ success: false, error: 'Demasiados intentos. Intenta de nuevo más tarde.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM casilleros WHERE lower(email) = lower($1) AND is_active = true',
      [email]
    );
    const casillero = rows[0];

    if (!casillero || casillero.numero_documento.trim() !== String(password).trim()) {
      return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos.' });
    }

    const token = crypto.randomUUID();
    clientSessions.set(token, casillero.id);

    res.cookie('client_session_token', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({ success: true, codigo: casillero.codigo });
  } catch (err) {
    console.error('Client login error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// 17. Client logout
app.post('/api/client/logout', (req, res) => {
  const token = getClientSessionToken(req);
  if (token) {
    clientSessions.delete(token);
  }
  res.clearCookie('client_session_token');
  res.json({ success: true });
});

// 18. Get own casillero info (Protected: client)
app.get('/api/client/me', requireClientAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM casilleros WHERE id = $1', [req.casilleroId]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Casillero not found' });
    }
    res.json({ success: true, casillero: rows[0] });
  } catch (err) {
    console.error('Error fetching own casillero:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 19. List own prealertas (Protected: client)
app.get('/api/client/prealertas', requireClientAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM prealertas WHERE casillero_id = $1 ORDER BY created_at DESC',
      [req.casilleroId]
    );
    res.json({ success: true, prealertas: rows });
  } catch (err) {
    console.error('Error fetching own prealertas:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 20. Create a prealerta (Protected: client) — casillero_id always comes from the session, never the body
app.post('/api/client/prealertas', requireClientAuth, async (req, res) => {
  const { tracking, tienda, transportadora, valor_declarado_usd, peso_estimado_lb, ciudad_entrega, descripcion, link_soporte } = req.body;

  if (!tienda || !transportadora || !valor_declarado_usd || !ciudad_entrega) {
    return res.status(400).json({ success: false, error: 'Completa tienda, transportadora, valor declarado y ciudad de entrega.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO prealertas (casillero_id, tracking, tienda, transportadora, valor_declarado_usd, peso_estimado_lb, ciudad_entrega, descripcion, link_soporte)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [req.casilleroId, tracking || null, tienda, transportadora, valor_declarado_usd, peso_estimado_lb || null, ciudad_entrega, descripcion || null, link_soporte || null]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Error creating prealerta:', err.message);
    res.status(500).json({ success: false, error: 'Database error. Please try again.' });
  }
});

// 21. List all prealertas, joined with casillero info (Protected: admin)
app.get('/api/admin/prealertas', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, c.codigo AS casillero_codigo, c.nombre_completo AS casillero_nombre
      FROM prealertas p
      JOIN casilleros c ON c.id = p.casillero_id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, prealertas: rows });
  } catch (err) {
    console.error('Error fetching prealertas:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 22. Update a prealerta's status/notes (Protected: admin)
app.patch('/api/admin/prealertas/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, admin_notes } = req.body;

  const validStatuses = ['Pendiente', 'En bodega Miami', 'En tránsito', 'Aduana', 'Listo para entrega', 'Entregado'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value.' });
  }

  const updates = [];
  const values = [];
  let i = 1;
  if (status) { updates.push(`status = $${i}`); values.push(status); i++; }
  if (admin_notes !== undefined) { updates.push(`admin_notes = $${i}`); values.push(admin_notes); i++; }
  if (updates.length === 0) {
    return res.status(400).json({ success: false, error: 'No hay campos para actualizar.' });
  }
  values.push(id);

  try {
    const result = await pool.query(`UPDATE prealertas SET ${updates.join(', ')} WHERE id = $${i}`, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Prealerta not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating prealerta:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// 23. Delete a prealerta (Protected: admin)
app.delete('/api/admin/prealertas/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM prealertas WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Prealerta not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting prealerta:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Catch-all route to redirect back to home page for unknown endpoints
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Logiclic server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });
