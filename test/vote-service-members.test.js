import test from 'node:test';
import assert from 'node:assert/strict';
import { VoteService } from '../src/vote-service.js';

function member(id, displayName, { bot = false, guild } = {}) {
  return {
    id,
    displayName,
    guild,
    user: { bot, tag: `${displayName}#0001` },
    displayAvatarURL: () => `https://cdn.discordapp.com/avatar/${id}.png`
  };
}

test('добавляет новых участников во все старые активные голосования без дублей', async () => {
  const votes = new Map();
  const store = {
    values: () => votes.values(),
    get: (id) => votes.get(id),
    set: async (vote) => votes.set(vote.id, vote)
  };
  const edits = [];
  const guild = { id: 'guild-1' };
  const oldMember = member('old', 'Борис', { guild });
  const offlineJoin = member('offline', 'Анна', { guild });
  guild.members = {
    fetch: async () => new Map([
      [oldMember.id, oldMember],
      [offlineJoin.id, offlineJoin]
    ])
  };

  const client = {
    guilds: { fetch: async () => guild },
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        messages: {
          fetch: async () => ({ edit: async (payload) => edits.push(payload) })
        }
      })
    }
  };
  const renderer = { render: async () => Buffer.from('parliament') };
  const service = new VoteService(client, store, renderer);
  const baseVote = {
    guildId: guild.id,
    channelId: 'channel-1',
    messageId: 'message-1',
    title: 'Старое голосование',
    description: 'Оно уже было запущено',
    pros: 'За',
    cons: 'Против',
    type: 'binary',
    ballots: {},
    endsAt: Date.now() + 3_600_000,
    seats: [{ userId: 'old', displayName: 'Борис', avatarUrl: 'old.png' }]
  };
  votes.set('active', { ...baseVote, id: 'active', status: 'active' });
  votes.set('closed', {
    ...baseVote,
    id: 'closed',
    status: 'closed',
    messageId: 'message-2',
    seats: [...baseVote.seats]
  });

  try {
    await service.restore();
    assert.deepEqual(
      votes.get('active').seats.map((seat) => seat.userId),
      ['offline', 'old'],
      'вход во время простоя подхватывается при запуске'
    );

    const onlineJoin = member('online', 'Виктор', { guild });
    assert.deepEqual(await service.addGuildMember(onlineJoin), {
      seatsAdded: 1,
      votesUpdated: 1
    });
    assert.deepEqual(await service.addGuildMember(onlineJoin), {
      seatsAdded: 0,
      votesUpdated: 0
    });
    assert.deepEqual(await service.addGuildMember(member('bot', 'Бот', { bot: true, guild })), {
      seatsAdded: 0,
      votesUpdated: 0
    });

    assert.deepEqual(
      votes.get('active').seats.map((seat) => seat.userId),
      ['offline', 'old', 'online']
    );
    assert.deepEqual(votes.get('closed').seats.map((seat) => seat.userId), ['old']);
    assert.equal(edits.length, 2, 'сообщение обновляется при сверке и новом входе');
    assert.match(edits.at(-1).embeds[0].toJSON().description, /0 из 3/);
  } finally {
    await service.shutdown();
  }
});
