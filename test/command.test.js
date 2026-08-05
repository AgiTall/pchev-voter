import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/command.js';

test('регистрирует оба типа голосования', () => {
  assert.deepEqual(
    commands.map((command) => command.name),
    ['set-vote', 'set-multi-vote']
  );

  const multi = commands.find((command) => command.name === 'set-multi-vote');
  const choices = multi.options.filter((option) => option.name.startsWith('choice-'));
  assert.equal(choices.length, 5);
  assert.ok(choices.every((option) => option.required === false));
});
