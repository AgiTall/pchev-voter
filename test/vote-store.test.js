import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VoteStore } from '../src/vote-store.js';

test('сохраняет голосования между запусками и дожидается записи', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pchev-voter-'));
  const filePath = path.join(directory, 'votes.json');

  try {
    const first = new VoteStore(filePath);
    await first.load();
    await first.set({ id: 'vote-1', status: 'active', ballots: { user: 'for' } });
    await first.flush();

    const restored = new VoteStore(filePath);
    await restored.load();
    assert.deepEqual(restored.get('vote-1'), {
      id: 'vote-1',
      status: 'active',
      ballots: { user: 'for' }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
