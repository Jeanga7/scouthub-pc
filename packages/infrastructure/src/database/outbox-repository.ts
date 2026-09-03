// pg resolves this package through the workerd condition for Cloudflare sockets.
import "pg-cloudflare";
import pg from "pg";
import type { QueryResultRow } from "pg";
import type { DomainEvent, OutboxEventStatus } from "@scouthub/domain";
import {
  assertValidClaimOutboxBatchInput,
  assertValidSettleOutboxEventInput,
  type ClaimOutboxBatchInput,
  type OutboxRecord,
  type OutboxRepository,
  type OutboxTransaction,
  type SettleOutboxEventInput
} from "@scouthub/application";

interface Queryable {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ readonly rows: TRow[] }>;
}

interface TransactionClient extends Queryable {
  release(): void;
}

interface ConnectablePool {
  connect(): Promise<TransactionClient>;
}

type OutboxEventRow = QueryResultRow & {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: OutboxRecord["payload"];
  status: OutboxEventStatus;
  attempts: string | number;
  created_at: Date;
  processed_at: Date | null;
};

export function createPgOutboxRepository(databaseUrl: string): OutboxRepository {
  return new PgOutboxRepository(databaseUrl);
}

export class PgOutboxRepository implements OutboxRepository {
  constructor(private readonly databaseUrl: string) {}

  async transaction<TResult>(
    handler: (transaction: OutboxTransaction) => Promise<TResult>
  ): Promise<TResult> {
    const pool = new pg.Pool({ connectionString: this.databaseUrl, max: 1 });
    // `pg-cloudflare` omits `connect` from its narrowed Pool declaration even
    // though node-postgres provides it at runtime. Pinning a client is required:
    // BEGIN and every outbox operation must use one physical connection.
    const client = await (pool as unknown as ConnectablePool).connect();
    try {
      await client.query("BEGIN");
      const result = await handler(new PgOutboxTransaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}

export class PgOutboxTransaction implements OutboxTransaction {
  constructor(private readonly db: Queryable) {}

  async append(event: DomainEvent): Promise<OutboxRecord> {
    const result = await this.db.query<OutboxEventRow>(
      `INSERT INTO outbox_events (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload,
        status, attempts, created_at, processed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7, NULL)
      RETURNING *`,
      [
        event.id,
        event.tenantId,
        event.aggregateType,
        event.aggregateId,
        event.eventType,
        event.payload,
        event.occurredAt
      ]
    );
    return requireRow(result.rows[0], "inserted");
  }

  async findById(tenantId: string, id: string): Promise<OutboxRecord | null> {
    const result = await this.db.query<OutboxEventRow>(
      `SELECT * FROM outbox_events
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, id]
    );
    return mapOptionalRow(result.rows[0]);
  }

  async listByAggregate(input: {
    readonly tenantId: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
  }): Promise<readonly OutboxRecord[]> {
    const result = await this.db.query<OutboxEventRow>(
      `SELECT * FROM outbox_events
       WHERE tenant_id = $1 AND aggregate_type = $2 AND aggregate_id = $3
       ORDER BY created_at ASC, id ASC`,
      [input.tenantId, input.aggregateType, input.aggregateId]
    );
    return result.rows.map(mapOutboxEvent);
  }

  async claimBatchForProcessing(
    input: ClaimOutboxBatchInput
  ): Promise<readonly OutboxRecord[]> {
    assertValidClaimOutboxBatchInput(input);
    // The lock and transition are one statement inside the caller's transaction.
    // SKIP LOCKED lets concurrent dispatchers claim disjoint batches immediately.
    const result = await this.db.query<OutboxEventRow>(
      `WITH candidates AS (
         SELECT id
         FROM outbox_events
         WHERE status = 'PENDING'
         ORDER BY created_at ASC, id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       ), claimed AS (
         UPDATE outbox_events AS event
         SET status = 'PROCESSING'
         FROM candidates
         WHERE event.id = candidates.id
         RETURNING event.*
       )
       SELECT * FROM claimed
       ORDER BY created_at ASC, id ASC`,
      [input.limit]
    );
    return result.rows.map(mapOutboxEvent);
  }

  async markSent(input: SettleOutboxEventInput): Promise<OutboxRecord | null> {
    assertValidSettleOutboxEventInput(input);
    return this.transition(
      `UPDATE outbox_events
       SET status = 'SENT', processed_at = $2
       WHERE id = $1 AND status = 'PROCESSING'
       RETURNING *`,
      [input.id, input.now]
    );
  }

  async markFailed(input: SettleOutboxEventInput): Promise<OutboxRecord | null> {
    assertValidSettleOutboxEventInput(input);
    return this.transition(
      `UPDATE outbox_events
       SET status = 'FAILED', attempts = attempts + 1, processed_at = $2
       WHERE id = $1 AND status = 'PROCESSING'
       RETURNING *`,
      [input.id, input.now]
    );
  }

  async reschedule(input: SettleOutboxEventInput): Promise<OutboxRecord | null> {
    assertValidSettleOutboxEventInput(input);
    return this.transition(
      `UPDATE outbox_events
       SET status = 'PENDING', processed_at = NULL
       WHERE id = $1 AND status = 'FAILED'
       RETURNING *`,
      [input.id]
    );
  }

  private async transition(
    query: string,
    values: readonly unknown[]
  ): Promise<OutboxRecord | null> {
    const result = await this.db.query<OutboxEventRow>(query, values);
    return mapOptionalRow(result.rows[0]);
  }
}

function mapOptionalRow(row: OutboxEventRow | undefined): OutboxRecord | null {
  return row === undefined ? null : mapOutboxEvent(row);
}

function requireRow(row: OutboxEventRow | undefined, action: string): OutboxRecord {
  if (row === undefined) {
    throw new Error(`Expected ${action} outbox event.`);
  }
  return mapOutboxEvent(row);
}

function mapOutboxEvent(row: OutboxEventRow): OutboxRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload,
    status: row.status,
    attempts: Number(row.attempts),
    createdAt: row.created_at,
    processedAt: row.processed_at
  };
}
