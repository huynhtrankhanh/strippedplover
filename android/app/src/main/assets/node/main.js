const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('StrippedPlover IME Node server is running.\n');
});

server.listen(8000, '0.0.0.0', () => {
  console.log('Node HTTP server listening on 0.0.0.0:8000');
});
