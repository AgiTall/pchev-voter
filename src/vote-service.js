import { randomUUID } from 'node:crypto';
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
    for (const vote of this.store.values()) {
      if (vote.status === 'active') this.schedule(vote);
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
