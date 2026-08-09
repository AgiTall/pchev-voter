import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PoliticsService } from '../src/politics-service.js';
import { PoliticsStore } from '../src/politics-store.js';

function makeGuild() {
  const members = new Map();
  const roles = new Map();
  const announcements = [];
  const messages = new Map();

  const getMember = (id) => {
    if (!members.has(id)) {
      const cache = new Map();
      members.set(id, {
        id,
        roles: {
          cache,
          add: async (roleId) => {
            cache.set(roleId, true);
            roles.get(roleId)?.members.set(id, members.get(id));
          },
          remove: async (roleId) => {
            cache.delete(roleId);
            roles.get(roleId)?.members.delete(id);
          }
        }
      });
    }
    return members.get(id);
  };

  const guild = {
    id: 'guild-1',
    members: {
      fetch: async (id) => (id ? getMember(id) : members)
    },
    roles: {
      fetch: async (id) => roles.get(id) ?? null,
      create: async (options) => {
        const role = { id: `role-${roles.size + 1}`, members: new Map(), ...options };
        roles.set(role.id, role);
        return role;
      }
    },
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        messages: { fetch: async (id) => messages.get(id) ?? null },
        send: async (payload) => {
          announcements.push(payload);
          const message = {
            id: `message-${messages.size + 1}`,
            payload,
            edit: async (next) => {
              message.payload = next;
              return message;
            }
          };
          messages.set(message.id, message);
          return message;
        }
      })
    }
  };
  return { guild, members, roles, announcements, messages, getMember };
}

test('проводит полный созыв: партии, выборы, кабинет и импичмент', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pchev-politics-service-'));
  const store = new PoliticsStore(path.join(directory, 'politics.json'));
  const fake = makeGuild();
  const client = { guilds: { fetch: async () => fake.guild } };
  const service = new PoliticsService(client, store);

  try {
    const alpha = (await service.createParty('guild-1', 'leader-a', 'Альфа', 'Первая', '🌹')).party;
    await service.createParty('guild-1', 'leader-b', 'Бета', 'Вторая');
    await service.joinParty('guild-1', 'member-a', alpha.id);
    assert.equal(alpha.emoji, '🌹');
    await service.updatePartyEmoji('guild-1', 'leader-a', '<:alpha:123456789012345678>');
    assert.equal(alpha.emoji, '<:alpha:123456789012345678>');

    const started = await service.startElection(fake.guild, 'channel-1');
    assert.equal(started.announcementSent, true);
    await service.castBallot('guild-1', 'voter-1', alpha.id);
    await service.castBallot('guild-1', 'voter-2', alpha.id);
    const finished = await service.finishElection(fake.guild, { announce: false });

    assert.equal(finished.outcome.winner.id, alpha.id);
    assert.equal(finished.state.office.presidentId, 'leader-a');
    assert.equal(fake.getMember('leader-a').roles.cache.size, 1);

    await service.assignAssistant(fake.guild, 'leader-a', 'member-a');
    assert.deepEqual(store.get('guild-1').office.assistants, ['member-a']);
    assert.equal(fake.getMember('member-a').roles.cache.size, 1);

    await service.impeach(fake.guild);
    assert.equal(store.get('guild-1').office.presidentId, null);
    assert.equal(fake.getMember('leader-a').roles.cache.size, 0);
    assert.equal(fake.getMember('member-a').roles.cache.size, 0);
    assert.equal(fake.announcements.length, 1, 'старт выборов публикует анонс');
  } finally {
    await service.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

test('публикует одну автообновляемую сводку и ограничивает спам', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pchev-politics-summary-'));
  const store = new PoliticsStore(path.join(directory, 'politics.json'));
  const fake = makeGuild();
  const client = { guilds: { fetch: async () => fake.guild } };
  const service = new PoliticsService(client, store);

  try {
    const alpha = (await service.createParty('guild-1', 'leader-a', 'Альфа', 'Первая')).party;
    await service.publishPartySummary(fake.guild, 'channel-1', 'publisher');
    const summaryId = store.get('guild-1').publicSummary.messageId;
    await service.joinParty('guild-1', 'member-a', alpha.id);

    assert.equal(fake.messages.size, 1);
    assert.match(fake.messages.get(summaryId).payload.embeds[0].toJSON().description, /2 участн/);
    await assert.rejects(
      service.publishPartySummary(fake.guild, 'channel-1', 'publisher'),
      /Подождите/
    );
  } finally {
    await service.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});
