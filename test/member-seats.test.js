import test from 'node:test';
import assert from 'node:assert/strict';
import { createHumanSeats } from '../src/member-seats.js';

function member(id, name, bot = false) {
  return {
    id,
    displayName: name,
    user: { bot },
    displayAvatarURL: () => `https://cdn.discordapp.com/avatar/${id}.png`
  };
}

test('исключает всех ботов из парламентской схемы', () => {
  const seats = createHumanSeats([
    member('human-2', 'Борис'),
    member('bot-1', 'Музыкальный бот', true),
    member('human-1', 'Анна'),
    member('bot-2', 'Модератор', true)
  ]);

  assert.deepEqual(
    seats.map((seat) => seat.userId),
    ['human-1', 'human-2']
  );
});
