import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildElectionMessage,
  buildHelpMessage,
  buildPartiesMessage,
  buildProfileMessage,
  buildPublicPartiesMessage,
  buildRoyalConfirmation,
  buildRoyalMessage,
  countElectionBallots,
  getElectionOutcome,
  POLITICS_COLOR
} from '../src/politics-ui.js';

function makeState() {
  return {
    parties: [
      {
        id: 'party-a',
        name: 'Альфа',
        emoji: '🌹',
        description: 'Первая партия',
        leaderId: 'leader-a',
        members: ['leader-a', 'member-a']
      },
      {
        id: 'party-b',
        name: 'Бета',
        emoji: '🌊',
        description: 'Вторая партия',
        leaderId: 'leader-b',
        members: ['leader-b']
      }
    ],
    election: {
      status: 'active',
      endsAt: Date.now() + 60_000,
      ballots: { one: 'party-a', two: 'party-a', three: 'party-b' }
    },
    office: { presidentId: null, partyId: null, assistants: [] },
    settings: { electionDurationMs: 86_400_000, moderatorLimit: 3, partyCreationCost: 0 }
  };
}

test('строит упрощённое персональное меню только с доступными действиями', () => {
  const message = buildPartiesMessage(makeState(), 'outsider', { selectedPartyId: 'party-a' });
  const embed = message.embeds[0].toJSON();
  const select = message.components[0].components[0].toJSON();
  const buttons = message.components[1].components.map((button) => button.toJSON());

  assert.equal(embed.color, POLITICS_COLOR);
  assert.equal(select.options.length, 2);
  assert.equal(select.options[0].default, true);
  assert.equal(select.options[0].emoji.name, '🌹');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].custom_id, 'politics:party:publish');
  assert.equal(buttons[0].label, 'Показать в канале');
});

test('строит публичную сводку партий с кнопкой обновления', () => {
  const message = buildPublicPartiesMessage(makeState());
  const embed = message.embeds[0].toJSON();

  assert.equal(message.components[0].components[0].toJSON().custom_id, 'politics:party:refresh');
  assert.match(embed.description, /Альфа/);
  assert.match(embed.description, /<@leader-a>/);
  assert.equal(message.allowedMentions.parse.length, 0);
});

test('строит краткую справку, профиль и подтверждение опасного действия', () => {
  const state = makeState();
  state.office.presidentId = 'leader-a';
  state.office.partyId = 'party-a';

  assert.match(buildHelpMessage().embeds[0].toJSON().description, /\/profile/);
  assert.match(buildProfileMessage(state, 'leader-a').embeds[0].toJSON().description, /Президент/);
  const confirmation = buildRoyalConfirmation(state, 'impeach');
  assert.match(confirmation.embeds[0].toJSON().title, /импичмент/i);
  assert.equal(confirmation.components[0].components.length, 2);
});

test('считает голоса и определяет единственного победителя', () => {
  const state = makeState();
  assert.deepEqual(countElectionBallots(state), {
    counts: { 'party-a': 2, 'party-b': 1 },
    total: 3
  });
  assert.equal(getElectionOutcome(state).winner.id, 'party-a');

  const message = buildElectionMessage(state, 'one', { selectedPartyId: 'party-b' });
  assert.equal(message.components.length, 2);
  assert.match(message.embeds[0].toJSON().description, /Альфа/);
});

test('показывает в королевской панели состояние и настройки', () => {
  const message = buildRoyalMessage(makeState());
  const buttons = message.components[0].components.map((button) => button.toJSON());
  assert.equal(buttons.length, 4);
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
});
