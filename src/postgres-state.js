import pg from 'pg';

const { Pool } = pg;

export class PostgresState {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
  }

  async connect() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bot_state (
        state_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async read(stateKey) {
    const result = await this.pool.query(
      'SELECT payload FROM bot_state WHERE state_key = $1',
      [stateKey]
    );
    return result.rows[0]?.payload ?? null;
  }

  async write(stateKey, payload) {
    await this.pool.query(
      `INSERT INTO bot_state (state_key, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (state_key) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [stateKey, JSON.stringify(payload)]
    );
  }

  async close() {
    await this.pool.end();
  }
}
