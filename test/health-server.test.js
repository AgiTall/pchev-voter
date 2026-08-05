import test from 'node:test';
import assert from 'node:assert/strict';
import { startHealthServer, stopHealthServer } from '../src/health-server.js';

test('отвечает Render на корневом маршруте и healthcheck', async () => {
  const server = await startHealthServer({ port: 0, getDiscordStatus: () => true });
  const { port } = server.address();

  try {
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(rootResponse.status, 200);
    assert.deepEqual(await rootResponse.json(), {
      ok: true,
      service: 'pchev-voter',
      discordReady: true
    });

    const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(healthResponse.status, 200);
  } finally {
    await stopHealthServer(server);
  }
});
