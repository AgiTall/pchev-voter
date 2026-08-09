import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/command.js';

test('регистрирует команды голосования, партий и управления', () => {
  assert.deepEqual(
    commands.map((command) => command.name),
    ['set-vote', 'set-multi-vote', 'restore-votes', 'help', 'profile', 'parties', 'election', 'royal']
  );

  const multi = commands.find((command) => command.name === 'set-multi-vote');
  const choices = multi.options.filter((option) => option.name.startsWith('choice-'));
  assert.equal(choices.length, 5);
  assert.ok(choices.every((option) => option.required === false));

  const restore = commands.find((command) => command.name === 'restore-votes');
  assert.equal(restore.options[0].type, 11);
  assert.equal(restore.options[0].required, true);

  const royal = commands.find((command) => command.name === 'royal');
  assert.ok(royal.default_member_permissions);
  assert.deepEqual(royal.options.map((option) => option.name), ['announcements', 'log']);
  assert.equal(commands.find((command) => command.name === 'parties').dm_permission, false);
  assert.equal(commands.find((command) => command.name === 'election').dm_permission, false);
});
