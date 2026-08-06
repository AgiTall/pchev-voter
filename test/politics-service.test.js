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
        send: async (message) => announcements.push(message)
      })
    }
  };
  return { guild, members, roles, announcements, getMember };
}

test('проводит полный созыв: партии, выборы, кабинет и импичмент', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pchev-politics-service-'));
  const store = new PoliticsStore(path.join(directory, 'politics.json'));
  const fake = makeGuild();
  const client = { guilds: { fetch: async () => fake.guild } };
  const service = new PoliticsService(client, store);

  try {
    const alpha = (await service.createParty('guild-1', 'leader-a', 'Альфа', 'Первая')).party;
    await service.createParty('guild-1', 'leader-b', 'Бета', 'Вторая');
    await service.joinParty('guild-1', 'member-a', alpha.id);

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
