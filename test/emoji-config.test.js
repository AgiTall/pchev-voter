import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getEmojis, loadEmojiConfig } from '../src/emoji-config.js';

test('загружает заменяемые эмодзи из отдельного файла', async () => {
  await loadEmojiConfig(path.resolve('config/emojis.json'));
  const emojis = getEmojis();
  const expectedKeys = [
    'abstain',
    'accepted',
    'active',
    'against',
    'arguments',
    'candidate',
    'choice1',
    'choice2',
    'choice3',
    'choice4',
    'choice5',
    'choices',
    'closed',
    'decision',
    'description',
    'empty',
    'for',
    'rejected',
    'results',
    'tie',
    'time',
    'veto',
    'voted'
  ];

  assert.deepEqual(Object.keys(emojis).sort(), expectedKeys);
  for (const value of Object.values(emojis)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 0);
  }
});
