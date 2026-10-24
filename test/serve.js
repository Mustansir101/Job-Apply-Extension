'use strict';

/**
 * Tiny static server for local testing:
 *   node test/serve.js
 *   open http://localhost:8765/test/form.html
 *
 * This is not part of the extension and uses only Node's standard library.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 8765;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

const server = http.createServer(function (request, response) {
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const resolved = path.resolve(root, '.' + urlPath);

  if (!resolved.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(resolved, function (statError, stat) {
    if (statError || !stat.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': types[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      // Test-only convenience: allows the filler to be evaluated on a remote
      // page during manual verification. The extension itself makes no requests.
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(resolved).pipe(response);
  });
});

server.listen(port, function () {
  console.log('Test server: http://localhost:' + port + '/test/form.html');
});
