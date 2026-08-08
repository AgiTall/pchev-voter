import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARTY_EMOJI, normalizePartyEmoji } from '../src/party-emoji.js';

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
