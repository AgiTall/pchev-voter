const UNIT_TO_MS = new Map([
  ['s', 1_000],
  ['sec', 1_000],
  ['secs', 1_000],
  ['second', 1_000],
  ['seconds', 1_000],
  ['с', 1_000],
  ['сек', 1_000],
  ['секунда', 1_000],
  ['секунды', 1_000],
  ['секунд', 1_000],
  ['m', 60_000],
  ['min', 60_000],
  ['mins', 60_000],
  ['minute', 60_000],
  ['minutes', 60_000],
  ['м', 60_000],
  ['мин', 60_000],
  ['минута', 60_000],
  ['минуты', 60_000],
  ['минут', 60_000],
  ['h', 3_600_000],
  ['hr', 3_600_000],
  ['hrs', 3_600_000],
  ['hour', 3_600_000],
  ['hours', 3_600_000],
  ['ч', 3_600_000],
  ['час', 3_600_000],
  ['часа', 3_600_000],
  ['часов', 3_600_000],
  ['d', 86_400_000],
  ['day', 86_400_000],
  ['days', 86_400_000],
  ['д', 86_400_000],
  ['дн', 86_400_000],
  ['день', 86_400_000],
  ['дня', 86_400_000],
  ['дней', 86_400_000],
  ['w', 604_800_000],
  ['week', 604_800_000],
  ['weeks', 604_800_000],
  ['нед', 604_800_000],
  ['неделя', 604_800_000],
  ['недели', 604_800_000],
  ['недель', 604_800_000]
]);

/**
 * Преобразует строки вроде "30m", "1h 20m" и "2 часа" в миллисекунды.
 * Возвращает null, если строка не распознана полностью.
 */
export function parseDuration(input) {
  const source = input.trim().toLowerCase().replaceAll(',', '.');
  if (!source) return null;

  const tokenPattern = /\s*(\d+(?:\.\d+)?)\s*([a-zа-яё]+)\s*/giy;
  let total = 0;
  let position = 0;
  let tokens = 0;

  while (position < source.length) {
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(source);
    if (!match) return null;

    const multiplier = UNIT_TO_MS.get(match[2]);
    if (!multiplier) return null;

    total += Number(match[1]) * multiplier;
    position = tokenPattern.lastIndex;
    tokens += 1;
  }

  if (!tokens || !Number.isFinite(total) || total <= 0) return null;
  return Math.round(total);
}

export function formatDuration(durationMs) {
  const units = [
    ['д', 86_400_000],
    ['ч', 3_600_000],
    ['мин', 60_000],
    ['с', 1_000]
  ];

  let remaining = durationMs;
  const parts = [];

  for (const [label, size] of units) {
    const amount = Math.floor(remaining / size);
    if (amount > 0) {
      parts.push(`${amount} ${label}`);
      remaining -= amount * size;
    }
  }

  return parts.slice(0, 2).join(' ') || 'меньше секунды';
}
