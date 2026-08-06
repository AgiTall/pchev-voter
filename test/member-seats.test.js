import test from 'node:test';
import assert from 'node:assert/strict';
import { createHumanSeat, createHumanSeats } from '../src/member-seats.js';

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

test('создаёт одно место для нового живого участника', () => {
  assert.deepEqual(createHumanSeat(member('human-1', 'Анна')), {
    userId: 'human-1',
    displayName: 'Анна',
    avatarUrl: 'https://cdn.discordapp.com/avatar/human-1.png'
  });
  assert.equal(createHumanSeat(member('bot-1', 'Бот', true)), null);
});
