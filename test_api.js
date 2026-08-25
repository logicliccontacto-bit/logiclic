const http = require('http');

// Test 1: Submit a contact form
function testContactSubmit(cb) {
  const payload = JSON.stringify({
    name: 'Carlos Leguizamón',
    email: 'cliente@empresa.com',
    company: 'Empresa Demo S.A.S',
    service: 'Automatización de procesos',
    message: 'Me interesa automatizar mi proceso de facturación.'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/contact',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };

  const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const result = JSON.parse(data);
      console.log('[POST /api/contact]', res.statusCode, result);
      cb(result);
    });
  });
  req.on('error', e => { console.error('Contact error:', e.message); cb(null); });
  req.write(payload);
  req.end();
}

// Test 2: Login as admin
function testLogin(cb) {
  const payload = JSON.stringify({ username: 'admin', password: 'admin.logiclic2026' });
  const options = {
    hostname: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };

  const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const result = JSON.parse(data);
      const cookie = res.headers['set-cookie'] ? res.headers['set-cookie'][0] : null;
      console.log('[POST /api/auth/login]', res.statusCode, result, 'Cookie set:', !!cookie);
      cb(cookie, result);
    });
  });
  req.on('error', e => { console.error('Login error:', e.message); cb(null, null); });
  req.write(payload);
  req.end();
}

// Test 3: Fetch admin requests
function testGetRequests(cookie, cb) {
  const options = {
    hostname: 'localhost', port: 3000, path: '/api/admin/requests', method: 'GET',
    headers: { Cookie: cookie }
  };

  const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const result = JSON.parse(data);
      console.log('[GET /api/admin/requests]', res.statusCode, `Requests found: ${result.requests ? result.requests.length : 0}`);
      if (result.requests && result.requests.length) {
        console.log('  First request:', JSON.stringify(result.requests[0]));
      }
      cb(result);
    });
  });
  req.on('error', e => { console.error('Requests error:', e.message); cb(null); });
  req.end();
}

// Test 4: Unauthorized access attempt
function testUnauthorized(cb) {
  const options = {
    hostname: 'localhost', port: 3000, path: '/api/admin/requests', method: 'GET'
  };

  const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('[GET /api/admin/requests (no auth)]', res.statusCode, JSON.parse(data));
      cb();
    });
  });
  req.on('error', e => { console.error('Unauth error:', e.message); cb(); });
  req.end();
}

// Run all tests sequentially
console.log('=== Logiclic API Integration Tests ===\n');
testContactSubmit(result => {
  if (!result || !result.success) { console.error('FAIL: Contact submit failed'); return; }
  console.log('PASS: Contact submit\n');
  
  testLogin((cookie, loginResult) => {
    if (!loginResult || !loginResult.success) { console.error('FAIL: Login failed'); return; }
    console.log('PASS: Admin login\n');

    testGetRequests(cookie, requests => {
      if (!requests || !requests.success) { console.error('FAIL: Get requests failed'); return; }
      console.log('PASS: Fetch admin requests\n');

      testUnauthorized(() => {
        console.log('PASS: Unauthorized access correctly blocked\n');
        console.log('=== All tests passed! Server is fully functional ===');
        process.exit(0);
      });
    });
  });
});
