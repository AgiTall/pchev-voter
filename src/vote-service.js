import { randomUUID } from 'node:crypto';
import { collectHumanSeats, createHumanSeat } from './member-seats.js';
import { buildVoteMessage } from './vote-ui.js';

const MAX_TIMEOUT = 2_147_000_000;
const COUNTDOWN_REFRESH_MS = 15_000;

export class VoteService {
  constructor(client, store, renderer) {
    this.client = client;
    this.store = store;
    this.renderer = renderer;
    this.timers = new Map();
    this.countdownTimers = new Map();
    this.locks = new Map();
  }

  async restore() {
    const activeGuildIds = new Set();
    for (const vote of this.store.values()) {
      if (vote.status !== 'active') continue;
      this.schedule(vote);
      if (vote.guildId && Date.now() < vote.endsAt) activeGuildIds.add(vote.guildId);
    }

    for (const guildId of activeGuildIds) {
      try {
        const guild = await this.client.guilds.fetch(guildId);
        await this.syncGuildMembers(guild);
      } catch (error) {
        console.error(`Не удалось сверить участников старых голосований сервера ${guildId}:`, error);
      }
    }
  }

  makeVote({
    guildId,
    channelId,
    creatorId,
    title,
    description,
    pros,
    cons,
    durationMs,
    seats,
    candidateId,
    type = 'binary',
    options = []
  }) {
    const now = Date.now();
    return {
      id: randomUUID(),
      guildId,
      channelId,
      messageId: null,
      creatorId,
      candidateId,
      type,
      options,
      title,
      description,
      pros,
      cons,
      createdAt: now,
      endsAt: now + durationMs,
      closedAt: null,
      status: 'active',
      seats,
      ballots: {}
    };
  }

  async create(vote) {
    await this.store.set(vote);
    this.schedule(vote);
  }

  async remove(voteId) {
    this.clearTimer(voteId);
    await this.store.delete(voteId);
  }

  async attachMessage(vote, messageId) {
    vote.messageId = messageId;
    await this.store.set(vote);
  }

  async cast(vote, userId, choice) {
    vote.ballots[userId] = choice;
    await this.store.set(vote);
  }

  async buildMessage(vote, replaceAttachments = false) {
    const imageBuffer = await this.renderer.render(vote);
    return buildVoteMessage(vote, { imageBuffer, replaceAttachments });
  }

  async addGuildMember(member) {
    const seat = createHumanSeat(member);
    if (!seat) return { seatsAdded: 0, votesUpdated: 0 };
    return this.addSeatsToActiveVotes(member.guild.id, [seat]);
  }

  async syncGuildMembers(guild) {
    const seats = await collectHumanSeats(guild);
    return this.addSeatsToActiveVotes(guild.id, seats);
  }

  async addSeatsToActiveVotes(guildId, candidateSeats) {
    let seatsAdded = 0;
    let votesUpdated = 0;
    const activeVotes = [...this.store.values()].filter(
      (vote) =>
        vote.guildId === guildId &&
        vote.status === 'active' &&
        Date.now() < vote.endsAt
    );

    await Promise.all(
      activeVotes.map((candidate) =>
        this.runExclusive(candidate.id, async () => {
          const vote = this.store.get(candidate.id);
          if (!vote || vote.status !== 'active' || Date.now() >= vote.endsAt) return;

          vote.seats ??= [];
          const existingIds = new Set(vote.seats.map((seat) => seat.userId));
          const missingSeats = candidateSeats.filter((seat) => !existingIds.has(seat.userId));
          if (!missingSeats.length) return;

          vote.seats.push(...missingSeats);
          vote.seats.sort((left, right) =>
            String(left.displayName ?? '').localeCompare(String(right.displayName ?? ''), 'ru')
          );
          await this.store.set(vote);
          seatsAdded += missingSeats.length;
          votesUpdated += 1;
          await this.refreshAfterSeatChange(vote);
        })
      )
    );

    return { seatsAdded, votesUpdated };
  }

  async refreshAfterSeatChange(vote) {
    if (!vote.messageId) return;
    try {
      const channel = await this.client.channels.fetch(vote.channelId);
      if (!channel?.isTextBased()) return;
      const message = await channel.messages.fetch(vote.messageId);
      await message.edit(await this.buildMessage(vote, true));
    } catch (error) {
      console.error(`Не удалось добавить нового участника на схему голосования ${vote.id}:`, error);
    }
  }

  async runExclusive(voteId, task) {
    const previous = this.locks.get(voteId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    this.locks.set(voteId, current);

    try {
      return await current;
    } finally {
      if (this.locks.get(voteId) === current) this.locks.delete(voteId);
    }
  }

  async shutdown() {
    for (const vote of this.store.values()) this.clearTimer(vote.id);
    await Promise.allSettled([...this.locks.values()]);
  }

  schedule(vote) {
    this.clearTimer(vote.id);
    const remaining = vote.endsAt - Date.now();

    if (remaining <= 0) {
      void this.close(vote.id);
      return;
    }

    const timer = setTimeout(() => {
      if (remaining > MAX_TIMEOUT) {
        this.schedule(vote);
      } else {
        void this.close(vote.id);
      }
    }, Math.min(remaining, MAX_TIMEOUT));

    timer.unref();
    this.timers.set(vote.id, timer);
    this.startCountdown(vote);
  }

  startCountdown(vote) {
    const previous = this.countdownTimers.get(vote.id);
    if (previous) clearInterval(previous);

    const interval = setInterval(() => {
      void this.refreshCountdown(vote.id);
    }, COUNTDOWN_REFRESH_MS);

    interval.unref();
    this.countdownTimers.set(vote.id, interval);
  }

  async refreshCountdown(voteId) {
    try {
      await this.runExclusive(voteId, async () => {
        const vote = this.store.get(voteId);
        if (!vote || vote.status !== 'active' || !vote.messageId || Date.now() >= vote.endsAt) {
          return;
        }

        const channel = await this.client.channels.fetch(vote.channelId);
        if (!channel?.isTextBased()) return;
        const message = await channel.messages.fetch(vote.messageId);
        await message.edit(
          buildVoteMessage(vote, { includeImage: Array.isArray(vote.seats) })
        );
      });
    } catch (error) {
      console.error(`Не удалось обновить таймер голосования ${voteId}:`, error);
    }
  }

  clearTimer(voteId) {
    const timer = this.timers.get(voteId);
    if (timer) clearTimeout(timer);
    this.timers.delete(voteId);

    const countdown = this.countdownTimers.get(voteId);
    if (countdown) clearInterval(countdown);
    this.countdownTimers.delete(voteId);
  }

  async close(voteId) {
    return this.runExclusive(voteId, () => this.closeUnlocked(voteId));
  }

  async closeUnlocked(voteId) {
    const vote = this.store.get(voteId);
    if (!vote || vote.status !== 'active') return;

    vote.status = 'closed';
    vote.closedAt = Date.now();
    this.clearTimer(vote.id);
    await this.store.set(vote);

    if (!vote.messageId) return;

    try {
      const channel = await this.client.channels.fetch(vote.channelId);
      if (!channel?.isTextBased()) return;
      const message = await channel.messages.fetch(vote.messageId);
      await message.edit(await this.buildMessage(vote, true));
    } catch (error) {
      console.error(`Не удалось обновить завершённое голосование ${vote.id}:`, error);
    }
  }
}
