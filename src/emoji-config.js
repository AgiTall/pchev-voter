import { readFile } from 'node:fs/promises';

const DEFAULT_EMOJIS = Object.freeze({
  active: '🟡',
  closed: '🔴',
  candidate: '👤',
  description: '📝',
  arguments: '⚖️',
  results: '📊',
  for: '✅',
  abstain: '⬜',
  against: '❌',
  veto: '🛑',
  voted: '👥',
  time: '⏳',
  decision: '🏁',
  accepted: '✅',
  rejected: '❌',
  tie: '➖',
  empty: '▫️',
  choices: '🔢',
  choice1: '1️⃣',
  choice2: '2️⃣',
  choice3: '3️⃣',
  choice4: '4️⃣',
  choice5: '5️⃣'
});

let configuredEmojis = { ...DEFAULT_EMOJIS };

export async function loadEmojiConfig(filePath) {
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  const next = { ...DEFAULT_EMOJIS };

  for (const key of Object.keys(DEFAULT_EMOJIS)) {
    if (typeof parsed[key] !== 'string' || !parsed[key].trim()) {
      throw new Error(`В config/emojis.json отсутствует корректное значение "${key}".`);
    }
    next[key] = parsed[key].trim();
  }

  configuredEmojis = next;
  return getEmojis();
}

export function getEmojis() {
  return { ...configuredEmojis };
}
