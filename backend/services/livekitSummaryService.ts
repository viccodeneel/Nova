/**
 * LiveKit Agent Builder end-of-call summary ingestion.
 *
 * Payload (per LiveKit's Agent Builder docs): job_id, room_id, room, started_at,
 * ended_at, summary (optional), results (optional, data-collection mode).
 *
 * This module is deliberately free of database imports so validation and the
 * in-memory store can be tested without touching DATABASE_URL. The PostgreSQL
 * store lives in livekitSummaryStore.ts.
 *
 * Summaries are stored as-is for later review. Nothing here writes to NOVA's AI
 * memory (nova_memories); that must remain an explicit, separate user action.
 */

export const LIMITS = {
  JOB_ID_MAX: 128,
  ID_MAX: 256,
  SUMMARY_MAX_CHARS: 20_000,
  RESULTS_MAX_BYTES: 100_000,
} as const;

const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

export interface SessionSummary {
  job_id: string;
  room_id: string | null;
  room: string | null;
  started_at: string | null; // normalized ISO 8601
  ended_at: string | null; // normalized ISO 8601
  summary: string | null;
  results: Record<string, unknown> | null;
}

export type ValidationResult =
  | { ok: true; value: SessionSummary }
  | { ok: false; errors: string[] };

export interface SessionSummaryStore {
  /** Inserts the summary. Returns created=false (and changes nothing) if job_id already exists. */
  save(summary: SessionSummary): Promise<{ created: boolean }>;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function optionalString(body: Record<string, unknown>, key: string, max: number, errors: string[]): string | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') { errors.push(`${key} must be a string`); return null; }
  if (v.length > max) { errors.push(`${key} must be at most ${max} characters`); return null; }
  return v;
}

function optionalTimestamp(body: Record<string, unknown>, key: string, errors: string[]): string | null {
  const v = body[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') { errors.push(`${key} must be an ISO 8601 timestamp string`); return null; }
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) { errors.push(`${key} must be a valid ISO 8601 timestamp`); return null; }
  return new Date(ms).toISOString();
}

/**
 * Validates an untrusted request body. Only job_id is required: it is the
 * idempotency key. Unknown top-level fields are ignored and never stored.
 * Error messages never echo submitted values.
 */
export function validateSessionSummary(body: unknown): ValidationResult {
  if (!isPlainObject(body)) return { ok: false, errors: ['Request body must be a JSON object'] };

  const errors: string[] = [];

  const jobId = body.job_id;
  let job_id = '';
  if (typeof jobId !== 'string' || jobId.length === 0) {
    errors.push('job_id is required and must be a non-empty string');
  } else if (jobId.length > LIMITS.JOB_ID_MAX || !JOB_ID_PATTERN.test(jobId)) {
    errors.push(`job_id must be 1-${LIMITS.JOB_ID_MAX} characters of letters, digits, "_", "-", "." or ":"`);
  } else {
    job_id = jobId;
  }

  const room_id = optionalString(body, 'room_id', LIMITS.ID_MAX, errors);
  const room = optionalString(body, 'room', LIMITS.ID_MAX, errors);
  const started_at = optionalTimestamp(body, 'started_at', errors);
  const ended_at = optionalTimestamp(body, 'ended_at', errors);
  const summary = optionalString(body, 'summary', LIMITS.SUMMARY_MAX_CHARS, errors);

  let results: Record<string, unknown> | null = null;
  if (body.results !== undefined && body.results !== null) {
    if (!isPlainObject(body.results)) {
      errors.push('results must be a JSON object');
    } else if (Buffer.byteLength(JSON.stringify(body.results), 'utf8') > LIMITS.RESULTS_MAX_BYTES) {
      errors.push(`results must be at most ${LIMITS.RESULTS_MAX_BYTES} bytes when serialized`);
    } else {
      results = body.results;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { job_id, room_id, room, started_at, ended_at, summary, results } };
}

/** First-write-wins in-memory store. Used when no database is configured, and in tests. */
export function createMemorySummaryStore(maxEntries = 500): SessionSummaryStore & { size(): number; get(jobId: string): SessionSummary | undefined } {
  const rows = new Map<string, SessionSummary>();
  return {
    async save(summary) {
      if (rows.has(summary.job_id)) return { created: false };
      if (rows.size >= maxEntries) {
        const oldest = rows.keys().next().value;
        if (oldest !== undefined) rows.delete(oldest);
      }
      rows.set(summary.job_id, summary);
      return { created: true };
    },
    size: () => rows.size,
    get: (jobId) => rows.get(jobId),
  };
}
