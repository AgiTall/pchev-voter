import { createServer } from 'node:http';

export async function startHealthServer({ port, getStatus = () => ({}) }) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    if (url.pathname !== '/' && url.pathname !== '/healthz') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const body = JSON.stringify({
      ok: true,
      service: 'pchev-voter',
      ...getStatus()
    });
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
}

export async function stopHealthServer(server) {
  if (!server?.listening) return;

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
