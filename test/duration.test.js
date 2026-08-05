import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, parseDuration } from '../src/duration.js';

test('разбирает короткие обозначения времени', () => {
  assert.equal(parseDuration('30m'), 30 * 60_000);
  assert.equal(parseDuration('1h 30m'), 90 * 60_000);
  assert.equal(parseDuration('2d'), 2 * 86_400_000);
});

test('разбирает русские обозначения времени', () => {
  assert.equal(parseDuration('2 часа'), 2 * 3_600_000);
  assert.equal(parseDuration('1 день 30 минут'), 86_400_000 + 30 * 60_000);
  assert.equal(parseDuration('1,5 часа'), 90 * 60_000);
});

test('отвергает неизвестное и неполное значение', () => {
  assert.equal(parseDuration('завтра'), null);
  assert.equal(parseDuration('10'), null);
  assert.equal(parseDuration('1h потом'), null);
  assert.equal(parseDuration(''), null);
});

test('форматирует длительность для журнала', () => {
  assert.equal(formatDuration(90 * 60_000), '1 ч 30 мин');
  assert.equal(formatDuration(2 * 86_400_000 + 3_600_000), '2 д 1 ч');
});
