import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PARTY_EMOJI,
  normalizePartyEmoji,
  resolveGuildPartyEmoji
} from '../src/party-emoji.js';

test('принимает один Unicode- или Discord-эмодзи для логотипа', () => {
  assert.equal(normalizePartyEmoji('🏳️‍🌈'), '🏳️‍🌈');
  assert.equal(
    normalizePartyEmoji('<a:dance:123456789012345678>'),
    '<a:dance:123456789012345678>'
  );
  assert.equal(normalizePartyEmoji('🌹🌊'), null);
  assert.equal(normalizePartyEmoji('logo'), null);
  assert.equal(normalizePartyEmoji('', { fallback: DEFAULT_PARTY_EMOJI }), DEFAULT_PARTY_EMOJI);
});

test('находит серверное эмодзи по имени или ID', () => {
  const emojis = new Map([
    ['123456789012345678', { id: '123456789012345678', name: 'party_logo', animated: false }],
    ['223456789012345678', { id: '223456789012345678', name: 'dance', animated: true }]
  ]);

  assert.equal(
    resolveGuildPartyEmoji(':party_logo:', emojis),
    '<:party_logo:123456789012345678>'
  );
  assert.equal(resolveGuildPartyEmoji('DANCE', emojis), '<a:dance:223456789012345678>');
  assert.equal(
    resolveGuildPartyEmoji('123456789012345678', emojis),
    '<:party_logo:123456789012345678>'
  );
  assert.equal(resolveGuildPartyEmoji('missing', emojis), null);
});
