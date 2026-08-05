import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class VoteStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.votes = new Map();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);

      for (const vote of parsed.votes ?? []) {
        vote.ballots ??= {};
        this.votes.set(vote.id, vote);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  get(id) {
    return this.votes.get(id);
  }

  values() {
    return this.votes.values();
  }

  async set(vote) {
    this.votes.set(vote.id, vote);
    await this.save();
    return vote;
  }

  async delete(id) {
    this.votes.delete(id);
    await this.save();
  }

  async save() {
    const writeSnapshot = async () => {
      const directory = path.dirname(this.filePath);
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      const payload = JSON.stringify(
        { version: 1, votes: [...this.votes.values()] },
        null,
        2
      );

      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, payload, 'utf8');
      await rename(temporaryPath, this.filePath);
    };

    this.writeQueue = this.writeQueue.then(writeSnapshot, writeSnapshot);
    return this.writeQueue;
  }

  async flush() {
    await this.writeQueue;
  }
}
