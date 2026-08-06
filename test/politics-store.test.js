import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PoliticsStore } from '../src/politics-store.js';

test('сохраняет политическое состояние отдельно по серверам', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pchev-politics-'));
  const filePath = path.join(directory, 'politics.json');

  try {
    const first = new PoliticsStore(filePath);
    const state = first.get('guild-1');
    state.parties.push({
      id: 'party-1',
      name: 'Прогресс',
      description: 'Вперёд',
      leaderId: 'leader',
      members: ['leader', 'member'],
      createdAt: 1
    });
    state.election.status = 'active';
    state.election.ballots.member = 'party-1';
    await first.save();
    await first.flush();

    const restored = new PoliticsStore(filePath);
    await restored.load();
    assert.equal(restored.get('guild-1').parties[0].name, 'Прогресс');
    assert.deepEqual(restored.get('guild-1').parties[0].members, ['leader', 'member']);
    assert.equal(restored.get('guild-1').election.ballots.member, 'party-1');
    assert.equal(restored.get('guild-2').settings.moderatorLimit, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
