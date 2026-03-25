const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4000;
const TARGET_HOST = process.env.TARGET_HOST || 'target';
const TARGET_PORT = process.env.TARGET_PORT || '80';

// Serve static files + proxy nginx_status as JSON API
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/status') {
    // Fetch nginx_status and parse it
    try {
      const data = await fetchNginxStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message, alive: false }));
    }
    return;
  }

  // Serve static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

function fetchNginxStatus() {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://${TARGET_HOST}:${TARGET_PORT}/nginx_status`,
      { timeout: 2000 },
      (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try {
            // Parse nginx stub_status format:
            // Active connections: 1
            // server accepts handled requests
            //  5 5 10
            // Reading: 0 Writing: 1 Waiting: 0
            const lines = body.trim().split('\n');
            const active = parseInt(lines[0].split(':')[1]) || 0;
            const counts = lines[2].trim().split(/\s+/);
            const accepted = parseInt(counts[0]) || 0;
            const handled = parseInt(counts[1]) || 0;
            const totalRequests = parseInt(counts[2]) || 0;
            const rww = lines[3].match(/Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)/);
            const reading = rww ? parseInt(rww[1]) : 0;
            const writing = rww ? parseInt(rww[2]) : 0;
            const waiting = rww ? parseInt(rww[3]) : 0;

            resolve({
              alive: true,
              active,
              accepted,
              handled,
              total_requests: totalRequests,
              reading,
              writing,
              waiting,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            reject(new Error('Parse error: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[monitor] Dashboard running on http://0.0.0.0:${PORT}`);
  console.log(`[monitor] Target: ${TARGET_HOST}:${TARGET_PORT}`);
});
