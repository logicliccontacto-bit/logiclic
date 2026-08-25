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

// === API ENDPOINTS ===

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
