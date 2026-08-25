const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { db, hashPassword } = require('./database');

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
app.post('/api/contact', (req, res) => {
  const { name, email, service, message } = req.body;
  // The landing page form sends 'company' and optionally 'phone'
  const company = req.body.company || req.body.phone || '';

  if (!name || !email || !service) {
    return res.status(400).json({ success: false, error: 'Name, email, and service are required.' });
  }

  const query = `
    INSERT INTO contact_requests (name, email, phone, service, message)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(query, [name, email, company, service, message || ''], function(err) {
    if (err) {
      console.error('Error inserting request:', err.message);
      return res.status(500).json({ success: false, error: 'Database error. Please try again.' });
    }
    res.json({ success: true, id: this.lastID });
  });
});

// 2. Admin Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const passHash = hashPassword(password);

  db.get(
    'SELECT * FROM users WHERE username = ? AND password_hash = ?',
    [username, passHash],
    (err, user) => {
      if (err) {
        console.error('Login database error:', err.message);
        return res.status(500).json({ success: false, error: 'Server error' });
      }

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
    }
  );
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
app.get('/api/admin/requests', requireAuth, (req, res) => {
  db.all(
    'SELECT * FROM contact_requests ORDER BY created_at DESC',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching requests:', err.message);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, requests: rows });
    }
  );
});

// 6. Update request status (Protected)
app.patch('/api/admin/requests/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Pendiente', 'En proceso', 'Completado'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value.' });
  }

  db.run(
    'UPDATE contact_requests SET status = ? WHERE id = ?',
    [status, id],
    function(err) {
      if (err) {
        console.error('Error updating status:', err.message);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }
      res.json({ success: true });
    }
  );
});

// 7. Delete request (Protected)
app.delete('/api/admin/requests/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.run(
    'DELETE FROM contact_requests WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        console.error('Error deleting request:', err.message);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }
      res.json({ success: true });
    }
  );
});

// Catch-all route to redirect back to home page for unknown endpoints
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Logiclic server is running on http://localhost:${PORT}`);
});
