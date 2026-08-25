const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Resolve the DB file path
const dbPath = path.join(__dirname, 'logiclic.db');

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to the SQLite database:', err.message);
  } else {
    console.log('Connected to the SQLite database logiclic.db');
  }
});

// Helper function to hash passwords using SHA-256
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Initialize tables
db.serialize(() => {
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table ready');
      // Check if we need to insert the default admin user
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
          console.error('Error checking users count:', err.message);
        } else if (row.count === 0) {
          const defaultAdmin = 'admin';
          const defaultPassword = 'admin.logiclic2026';
          const passHash = hashPassword(defaultPassword);

          db.run(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [defaultAdmin, passHash],
            (err) => {
              if (err) {
                console.error('Error creating default admin user:', err.message);
              } else {
                console.log('Default admin user created successfully.');
                console.log('Credentials: admin / admin.logiclic2026');
              }
            }
          );
        }
      });
    }
  });

  // Create contact_requests table
  db.run(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      service TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'Pendiente',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating contact_requests table:', err.message);
    } else {
      console.log('Contact requests table ready');
    }
  });
});

module.exports = {
  db,
  hashPassword
};
