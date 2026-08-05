import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSeatLayout, SEAT_COLORS } from '../src/parliament-renderer.js';

test('раскладывает всех участников внутри изображения', () => {
  const { seatSize, positions } = calculateSeatLayout(120, 1_678, 941);

  assert.equal(positions.length, 120);
  assert.ok(seatSize >= 16);
  for (const position of positions) {
    assert.ok(position.x >= 0);
    assert.ok(position.y >= 0);
    assert.ok(position.x + position.size <= 1_678);
    assert.ok(position.y + position.size <= 941);
  }
});

test('создаёт несколько полукруглых рядов', () => {
  const { positions } = calculateSeatLayout(50, 1_678, 941);
  assert.ok(new Set(positions.map((position) => position.row)).size >= 3);
});

test('использует отдельный бордовый цвет для вето', () => {
  assert.equal(SEAT_COLORS.for, '#2ECC71');
  assert.equal(SEAT_COLORS.abstain, '#AEB4BE');
  assert.equal(SEAT_COLORS.against, '#E23B3B');
  assert.equal(SEAT_COLORS.veto, '#7A1737');
});

test('использует пять разных цветов для вариантов ответа', () => {
  const colors = [
    SEAT_COLORS.choice1,
    SEAT_COLORS.choice2,
    SEAT_COLORS.choice3,
    SEAT_COLORS.choice4,
    SEAT_COLORS.choice5
  ];
  assert.equal(new Set(colors).size, 5);
});
