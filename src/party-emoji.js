export const DEFAULT_PARTY_EMOJI = '🏳️';

const CUSTOM_EMOJI_PATTERN = /^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/;
const EMOJI_CODE_POINT_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Presentation}]|\u20e3/u;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function normalizePartyEmoji(value, { fallback = null } = {}) {
  const emoji = String(value ?? '').trim();
  if (!emoji) return fallback;
  if (CUSTOM_EMOJI_PATTERN.test(emoji)) return emoji;

  const graphemes = [...graphemeSegmenter.segment(emoji)];
  if (graphemes.length === 1 && EMOJI_CODE_POINT_PATTERN.test(emoji)) return emoji;
  return fallback;
}

export function resolveGuildPartyEmoji(value, emojis) {
  const input = String(value ?? '').trim();
  const normalized = normalizePartyEmoji(input);
  if (normalized) return normalized;

  const emojiId = /^\d{17,20}$/.test(input) ? input : null;
  const emojiName = input.match(/^:([A-Za-z0-9_]{2,32}):$/)?.[1] ??
    (/^[A-Za-z0-9_]{2,32}$/.test(input) ? input : null);
  const collection = emojis?.values ? [...emojis.values()] : [...(emojis ?? [])];
  const emoji = emojiId
    ? collection.find((candidate) => candidate.id === emojiId)
    : collection.find((candidate) => candidate.name?.toLowerCase() === emojiName?.toLowerCase());

  if (!emoji?.id || !emoji?.name) return null;
  return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
}
