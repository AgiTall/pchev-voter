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
