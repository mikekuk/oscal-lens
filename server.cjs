// Minimal local static server. Browser processing requires an HTTP origin.
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const root = path.join(__dirname, 'dist');
http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent(new URL(req.url, 'http://local').pathname)
  } catch {
    res.writeHead(400).end();
    return
  }
  const file = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
  // Resolve paths before enforcing the public-directory boundary.
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return
    }
    res.setHeader('Content-Type', ({
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.json': 'application/json'
    })[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(data)
  })
}).listen(process.env.PORT || 3000, () => console.log('OSCAL Lens: http://localhost:' + (process
  .env.PORT || 3000)));
