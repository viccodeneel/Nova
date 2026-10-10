import { query, isDatabaseConnected } from '../../database/db.ts';
import {
  createMemorySummaryStore,
  type SessionSummary,
  type SessionSummaryStore,
} from './livekitSummaryService.ts';

/**
 * Default store: PostgreSQL/Supabase when connected, otherwise the in-memory
 * fallback (same convention as the other NOVA services).
 *
 * Idempotency: job_id is the primary key and the insert is
 * ON CONFLICT DO NOTHING, so a retried delivery never overwrites or duplicates.
 */
export function createSessionSummaryStore(): SessionSummaryStore {
  const fallback = createMemorySummaryStore();
  return {
    async save(s: SessionSummary) {
      if (!isDatabaseConnected()) return fallback.save(s);
      const r = await query(
        `INSERT INTO livekit_session_summaries
           (job_id, room_id, room, started_at, ended_at, summary, results)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (job_id) DO NOTHING
         RETURNING job_id`,
        [s.job_id, s.room_id, s.room, s.started_at, s.ended_at, s.summary, s.results === null ? null : JSON.stringify(s.results)],
      );
      if (!r) throw new Error('Database write failed');
      return { created: r.rowCount === 1 };
    },
  };
}
