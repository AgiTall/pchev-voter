import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PARTY_EMOJI, normalizePartyEmoji } from './party-emoji.js';

export const DEFAULT_POLITICS_SETTINGS = Object.freeze({
  electionDurationMs: 86_400_000,
  moderatorLimit: 3,
  partyCreationCost: 0
});

function makeGuildState(guildId) {
  return {
    guildId,
    parties: [],
    election: {
      status: 'inactive',
      ballots: {},
      startedAt: null,
      endsAt: null,
      channelId: null,
      completedAt: null,
      winnerPartyId: null
    },
    office: {
      presidentId: null,
      partyId: null,
      assistants: [],
      termStartedAt: null
    },
    roleIds: {
      president: null,
      assistant: null
    },
    settings: { ...DEFAULT_POLITICS_SETTINGS }
  };
}

function normalizeGuildState(guildId, source = {}) {
  const state = makeGuildState(guildId);
  const parties = Array.isArray(source.parties) ? source.parties : [];

  state.parties = parties
    .filter((party) => party?.id && party?.name && party?.leaderId)
    .map((party) => ({
      id: String(party.id),
      name: String(party.name),
      emoji: normalizePartyEmoji(party.emoji, { fallback: DEFAULT_PARTY_EMOJI }),
      description: String(party.description ?? ''),
      leaderId: String(party.leaderId),
      members: [...new Set([String(party.leaderId), ...(party.members ?? []).map(String)])],
      createdAt: Number(party.createdAt) || Date.now()
    }));

  state.election = {
    ...state.election,
    ...(source.election ?? {}),
    ballots: { ...(source.election?.ballots ?? {}) }
  };
  state.office = {
    ...state.office,
    ...(source.office ?? {}),
    assistants: [...new Set((source.office?.assistants ?? []).map(String))]
  };
  state.roleIds = { ...state.roleIds, ...(source.roleIds ?? {}) };
  state.settings = { ...state.settings, ...(source.settings ?? {}) };

  return state;
}

export class PoliticsStore {
  constructor(filePath, { database = null, stateKey = 'politics' } = {}) {
    this.filePath = filePath;
    this.database = database;
    this.stateKey = stateKey;
    this.guilds = new Map();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const parsed = this.database
        ? await this.database.read(this.stateKey)
        : JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!parsed) return;
      for (const [guildId, source] of Object.entries(parsed.guilds ?? {})) {
        this.guilds.set(guildId, normalizeGuildState(guildId, source));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  get(guildId) {
    if (!this.guilds.has(guildId)) {
      this.guilds.set(guildId, makeGuildState(guildId));
    }
    return this.guilds.get(guildId);
  }

  values() {
    return this.guilds.values();
  }

  async importMissing(filePath) {
    try {
      return await this.importMissingContent(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }
  }

  async importMissingContent(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed.guilds || typeof parsed.guilds !== 'object') {
      throw new TypeError('Файл импорта должен содержать объект guilds.');
    }

    let imported = 0;
    for (const [guildId, source] of Object.entries(parsed.guilds)) {
      if (this.guilds.has(guildId)) continue;
      this.guilds.set(guildId, normalizeGuildState(guildId, source));
      imported += 1;
    }
    if (imported > 0) await this.save();
    return imported;
  }

  async save() {
    const state = { version: 1, guilds: Object.fromEntries(this.guilds) };
    const writeSnapshot = async () => {
      if (this.database) {
        await this.database.write(this.stateKey, state);
        return;
      }
      const directory = path.dirname(this.filePath);
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      const snapshot = JSON.stringify(state, null, 2);
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, snapshot, 'utf8');
      await rename(temporaryPath, this.filePath);
    };

    this.writeQueue = this.writeQueue.then(writeSnapshot, writeSnapshot);
    return this.writeQueue;
  }

  async flush() {
    await this.writeQueue;
  }
}
