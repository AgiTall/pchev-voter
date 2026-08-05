import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

test('импортирует отсутствующие голосования и не перезаписывает существующие', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pchev-voter-import-'));
  const filePath = path.join(directory, 'votes.json');
  const seedPath = path.join(directory, 'votes-seed.json');

  try {
    const store = new VoteStore(filePath);
    await store.set({ id: 'existing', ballots: { user: 'choice2' } });
    await writeFile(
      seedPath,
      JSON.stringify({
        version: 1,
        votes: [
          { id: 'existing', ballots: { user: 'choice1' } },
          { id: 'missing', status: 'active', ballots: { another: 'choice5' } }
        ]
      }),
      'utf8'
    );

    assert.equal(await store.importMissing(seedPath), 1);
    assert.deepEqual(store.get('existing').ballots, { user: 'choice2' });
    assert.deepEqual(store.get('missing'), {
      id: 'missing',
      status: 'active',
      ballots: { another: 'choice5' }
    });
    assert.equal(await store.importMissing(seedPath), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
