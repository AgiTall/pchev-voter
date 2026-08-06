import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import {
  buildElectionFinishedEmbed,
  buildElectionStartedEmbed,
  findUserParty,
  getElectionOutcome
} from './politics-ui.js';

const MAX_TIMER_DELAY = 2_147_000_000;
const PRESIDENT_ROLE_NAME = 'Президент';
const ASSISTANT_ROLE_NAME = 'Помощник президента';

export class PoliticsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PoliticsError';
  }
}

const cleanText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

export class PoliticsService {
  constructor(client, store) {
    this.client = client;
    this.store = store;
    this.locks = new Map();
    this.timers = new Map();
  }

  async runExclusive(guildId, task) {
    const previous = this.locks.get(guildId) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this.locks.set(guildId, gate);

    await previous.catch(() => {});
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(guildId) === gate) this.locks.delete(guildId);
    }
  }

  async createParty(guildId, userId, nameInput, descriptionInput) {
    return this.runExclusive(guildId, async () => {
      const state = this.store.get(guildId);
      const name = cleanText(nameInput);
      const description = String(descriptionInput ?? '').trim();

      if (state.election.status === 'active') {
        throw new PoliticsError('Во время выборов состав и список партий заморожены.');
      }
      if (findUserParty(state, userId)) {
        throw new PoliticsError('Сначала выйдите из своей текущей партии.');
      }
      if (state.parties.length >= 25) {
        throw new PoliticsError('Достигнут лимит Discord: не больше 25 партий.');
      }
      if (name.length < 2 || name.length > 80) {
        throw new PoliticsError('Название партии должно содержать от 2 до 80 символов.');
      }
      if (description.length < 2 || description.length > 1_000) {
        throw new PoliticsError('Описание партии должно содержать от 2 до 1000 символов.');
      }
      const duplicate = state.parties.some(
        (party) => party.name.localeCompare(name, 'ru', { sensitivity: 'accent' }) === 0
      );
      if (duplicate) throw new PoliticsError('Партия с таким названием уже существует.');

      const party = {
        id: randomUUID(),
        name,
        description,
        leaderId: userId,
        members: [userId],
        createdAt: Date.now()
      };
      state.parties.push(party);
      await this.store.save();
      return { party, configuredCost: state.settings.partyCreationCost };
    });
  }

  async joinParty(guildId, userId, partyId) {
    return this.runExclusive(guildId, async () => {
      const state = this.store.get(guildId);
      if (state.election.status === 'active') {
        throw new PoliticsError('Во время выборов состав партий заморожен.');
      }
      if (findUserParty(state, userId)) {
        throw new PoliticsError('Вы уже состоите в партии. Сначала выйдите из неё.');
      }
      const party = state.parties.find((candidate) => candidate.id === partyId);
      if (!party) throw new PoliticsError('Выбранная партия больше не существует.');

      party.members.push(userId);
      await this.store.save();
      return party;
    });
  }

  async leaveParty(guild, userId) {
    return this.runExclusive(guild.id, async () => {
      const state = this.store.get(guild.id);
      if (state.election.status === 'active') {
        throw new PoliticsError('Во время выборов состав партий заморожен.');
      }
      const party = findUserParty(state, userId);
      if (!party) throw new PoliticsError('Вы не состоите ни в одной партии.');
      if (state.office.presidentId === userId) {
        throw new PoliticsError('Президент не может покинуть партию до завершения созыва или импичмента.');
      }

      party.members = party.members.filter((id) => id !== userId);
      let newLeaderId = null;
      let deleted = false;
      if (party.leaderId === userId) {
        if (party.members.length) {
          party.leaderId = party.members[0];
          newLeaderId = party.leaderId;
        } else {
          state.parties = state.parties.filter((candidate) => candidate.id !== party.id);
          deleted = true;
        }
      }

      const wasAssistant = state.office.assistants.includes(userId);
      state.office.assistants = state.office.assistants.filter((id) => id !== userId);
      await this.store.save();

      const warnings = [];
      if (wasAssistant) {
        const warning = await this.removeRoleFromMember(guild, state.roleIds.assistant, userId);
        if (warning) warnings.push(warning);
      }
      return { party, deleted, newLeaderId, warnings };
    });
  }

  async updateSettings(guildId, settings) {
    return this.runExclusive(guildId, async () => {
      const state = this.store.get(guildId);
      state.settings = { ...state.settings, ...settings };
      await this.store.save();
      return state.settings;
    });
  }

  async startElection(guild, channelId) {
    const state = await this.runExclusive(guild.id, async () => {
      const current = this.store.get(guild.id);
      if (current.election.status === 'active') {
        throw new PoliticsError('Выборы уже идут.');
      }
      if (current.parties.length < 2) {
        throw new PoliticsError('Для выборов нужны как минимум две партии.');
      }

      const startedAt = Date.now();
      current.election = {
        status: 'active',
        ballots: {},
        startedAt,
        endsAt: startedAt + current.settings.electionDurationMs,
        channelId,
        completedAt: null,
        winnerPartyId: null
      };
      await this.store.save();
      return current;
    });

    this.scheduleElection(guild.id);
    const announcementSent = await this.sendAnnouncement(
      guild,
      channelId,
      buildElectionStartedEmbed(state)
    );
    return { state, announcementSent };
  }

  async castBallot(guildId, userId, partyId) {
    return this.runExclusive(guildId, async () => {
      const state = this.store.get(guildId);
      if (state.election.status !== 'active') {
        throw new PoliticsError('Сейчас нет активных выборов.');
      }
      if (Date.now() >= state.election.endsAt) {
        throw new PoliticsError('Время голосования уже истекло.');
      }
      const party = state.parties.find((candidate) => candidate.id === partyId);
      if (!party) throw new PoliticsError('Выбранная партия больше не участвует в выборах.');

      state.election.ballots[userId] = partyId;
      await this.store.save();
      return party;
    });
  }

  async finishElection(guild, { announce = true } = {}) {
    const result = await this.runExclusive(guild.id, async () => {
      const state = this.store.get(guild.id);
      if (state.election.status !== 'active') {
        throw new PoliticsError('Активных выборов нет.');
      }

      const outcome = getElectionOutcome(state);
      state.election.status = 'completed';
      state.election.completedAt = Date.now();
      state.election.winnerPartyId = outcome.winner?.id ?? null;
      state.office = outcome.winner
        ? {
            presidentId: outcome.winner.leaderId,
            partyId: outcome.winner.id,
            assistants: [],
            termStartedAt: Date.now()
          }
        : { presidentId: null, partyId: null, assistants: [], termStartedAt: null };
      await this.store.save();

      const warnings = await this.clearManagedRoles(guild, state);
      if (outcome.winner) {
        const presidentRole = await this.ensureRole(guild, state, 'president');
        if (presidentRole.error) {
          warnings.push(presidentRole.error);
        } else {
          const warning = await this.addRoleToMember(
            guild,
            presidentRole.role.id,
            outcome.winner.leaderId
          );
          if (warning) warnings.push(warning);
        }
        await this.store.save();
      }

      return { state, outcome, warnings };
    });

    this.clearElectionTimer(guild.id);
    let announcementSent = false;
    if (announce) {
      announcementSent = await this.sendAnnouncement(
        guild,
        result.state.election.channelId,
        buildElectionFinishedEmbed(result.state, result.outcome),
        result.warnings
      );
    }
    return { ...result, announcementSent };
  }

  async impeach(guild) {
    return this.runExclusive(guild.id, async () => {
      const state = this.store.get(guild.id);
      if (!state.office.presidentId && state.office.assistants.length === 0) {
        throw new PoliticsError('Текущий созыв уже пуст.');
      }
      state.office = { presidentId: null, partyId: null, assistants: [], termStartedAt: null };
      await this.store.save();
      const warnings = await this.clearManagedRoles(guild, state);
      return { state, warnings };
    });
  }

  async assignAssistant(guild, presidentId, memberId) {
    return this.runExclusive(guild.id, async () => {
      const state = this.store.get(guild.id);
      this.assertPresident(state, presidentId);
      const party = state.parties.find((candidate) => candidate.id === state.office.partyId);
      if (!party?.members.includes(memberId)) {
        throw new PoliticsError('Назначить можно только участника президентской партии.');
      }
      if (memberId === presidentId) throw new PoliticsError('Президент уже возглавляет кабинет.');
      if (state.office.assistants.includes(memberId)) {
        throw new PoliticsError('Этот участник уже назначен помощником.');
      }
      if (state.office.assistants.length >= state.settings.moderatorLimit) {
        throw new PoliticsError(`Достигнут лимит помощников: ${state.settings.moderatorLimit}.`);
      }

      const roleResult = await this.ensureRole(guild, state, 'assistant');
      if (roleResult.error) throw new PoliticsError(roleResult.error);
      await this.store.save();
      const warning = await this.addRoleToMember(guild, roleResult.role.id, memberId);
      if (warning) throw new PoliticsError(warning);

      state.office.assistants.push(memberId);
      await this.store.save();
      return state;
    });
  }

  async removeAssistant(guild, presidentId, memberId) {
    return this.runExclusive(guild.id, async () => {
      const state = this.store.get(guild.id);
      this.assertPresident(state, presidentId);
      if (!state.office.assistants.includes(memberId)) {
        throw new PoliticsError('Этот участник не занимает должность помощника.');
      }

      state.office.assistants = state.office.assistants.filter((id) => id !== memberId);
      await this.store.save();
      const warning = await this.removeRoleFromMember(guild, state.roleIds.assistant, memberId);
      return { state, warning };
    });
  }

  assertPresident(state, userId) {
    if (!state.office.presidentId || state.office.presidentId !== userId) {
      throw new PoliticsError('Кабинетом может управлять только действующий Президент.');
    }
  }

  async ensureRole(guild, state, type) {
    const roleId = state.roleIds[type];
    if (roleId) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (role) return { role };
    }

    const isPresident = type === 'president';
    try {
      const role = await guild.roles.create({
        name: isPresident ? PRESIDENT_ROLE_NAME : ASSISTANT_ROLE_NAME,
        color: isPresident ? 0xf1c40f : 0x3498db,
        permissions: isPresident
          ? []
          : [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers],
        reason: 'Управляемая роль политической системы'
      });
      state.roleIds[type] = role.id;
      return { role };
    } catch (error) {
      console.error(`Не удалось создать роль ${type}:`, error);
      return {
        error: 'Бот не смог создать управляемую роль. Проверьте право «Управление ролями» и иерархию ролей.'
      };
    }
  }

  async addRoleToMember(guild, roleId, userId) {
    try {
      const member = await guild.members.fetch(userId);
      await member.roles.add(roleId, 'Назначение политической системой');
      return null;
    } catch (error) {
      console.error(`Не удалось выдать роль ${roleId} участнику ${userId}:`, error);
      return 'Не удалось выдать роль: проверьте право бота «Управление ролями» и положение его роли.';
    }
  }

  async removeRoleFromMember(guild, roleId, userId) {
    if (!roleId) return null;
    try {
      const member = await guild.members.fetch(userId);
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Снятие должности политической системой');
      }
      return null;
    } catch (error) {
      console.error(`Не удалось снять роль ${roleId} с участника ${userId}:`, error);
      return 'Не удалось снять одну из ролей: проверьте право бота «Управление ролями».';
    }
  }

  async clearManagedRoles(guild, state) {
    const warnings = [];
    try {
      await guild.members.fetch();
    } catch (error) {
      console.error('Не удалось обновить список участников перед снятием ролей:', error);
    }

    for (const roleId of [state.roleIds.president, state.roleIds.assistant].filter(Boolean)) {
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) continue;
      for (const member of role.members.values()) {
        const warning = await this.removeRoleFromMember(guild, roleId, member.id);
        if (warning && !warnings.includes(warning)) warnings.push(warning);
      }
    }
    return warnings;
  }

  clearElectionTimer(guildId) {
    const timer = this.timers.get(guildId);
    if (timer) clearTimeout(timer);
    this.timers.delete(guildId);
  }

  scheduleElection(guildId) {
    this.clearElectionTimer(guildId);
    const state = this.store.get(guildId);
    if (state.election.status !== 'active') return;

    const delay = Math.max(0, state.election.endsAt - Date.now());
    const timer = setTimeout(async () => {
      if (delay > MAX_TIMER_DELAY) {
        this.scheduleElection(guildId);
        return;
      }
      try {
        const guild = await this.client.guilds.fetch(guildId);
        const current = this.store.get(guildId);
        if (current.election.status === 'active' && Date.now() >= current.election.endsAt) {
          await this.finishElection(guild, { announce: true });
        } else {
          this.scheduleElection(guildId);
        }
      } catch (error) {
        console.error(`Не удалось автоматически завершить выборы сервера ${guildId}:`, error);
        const retryTimer = setTimeout(() => this.scheduleElection(guildId), 60_000);
        retryTimer.unref?.();
        this.timers.set(guildId, retryTimer);
      }
    }, Math.min(delay, MAX_TIMER_DELAY));
    timer.unref?.();
    this.timers.set(guildId, timer);
  }

  async restore() {
    for (const state of this.store.values()) {
      if (state.election.status === 'active') this.scheduleElection(state.guildId);
    }
  }

  async sendAnnouncement(guild, channelId, embed, warnings = []) {
    if (!channelId) return false;
    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel?.isTextBased()) return false;
      await channel.send({
        content: warnings.length ? `⚠️ ${warnings.join(' ')}` : undefined,
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
      return true;
    } catch (error) {
      console.error(`Не удалось отправить политический анонс в канал ${channelId}:`, error);
      return false;
    }
  }

  async shutdown() {
    for (const guildId of this.timers.keys()) this.clearElectionTimer(guildId);
    await this.store.flush();
  }
}
