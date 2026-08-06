import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  constructor(filePath) {
    this.filePath = filePath;
    this.guilds = new Map();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
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

  async save() {
    const snapshot = JSON.stringify(
      { version: 1, guilds: Object.fromEntries(this.guilds) },
      null,
      2
    );
    const writeSnapshot = async () => {
      const directory = path.dirname(this.filePath);
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
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
