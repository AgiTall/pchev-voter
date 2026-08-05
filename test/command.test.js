import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/command.js';

test('регистрирует команды голосования и восстановления', () => {
  assert.deepEqual(
    commands.map((command) => command.name),
    ['set-vote', 'set-multi-vote', 'restore-votes']
  );

  const multi = commands.find((command) => command.name === 'set-multi-vote');
  const choices = multi.options.filter((option) => option.name.startsWith('choice-'));
  assert.equal(choices.length, 5);
  assert.ok(choices.every((option) => option.required === false));

  const restore = commands.find((command) => command.name === 'restore-votes');
  assert.equal(restore.options[0].type, 11);
  assert.equal(restore.options[0].required, true);
});
