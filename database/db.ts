import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root and /backend
dotenv.config({ override: true });
const backendEnv = path.resolve(__dirname, '../backend/.env');
if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv, override: true });
}

// DATABASE_URL can be provided from Supabase or standard PostgreSQL
let databaseUrl = process.env.DATABASE_URL;

let pool: pg.Pool | null = null;
let isConnected = false;

if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.DB_SSL === 'false'
          ? false
          : {
              rejectUnauthorized: false, // Required for Supabase and managed cloud instances
            },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected client error on idle client:', err);
    });
  } catch (err) {
    console.warn('[PostgreSQL] Could not initialize pool:', err);
  }
}

/**
 * Executes a SQL query with parameters against PostgreSQL.
 * If DATABASE_URL is not set or unavailable, returns null.
 */
export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T> | null> {
  if (!pool) return null;
  try {
    const res = await pool.query<T>(text, params);
    isConnected = true;
    return res;
  } catch (err) {
    console.error('[PostgreSQL Query Error]:', err);
    throw err;
  }
}

/**
 * Initializes the database tables by executing database/schema.sql
 */
export async function initializeDatabase(): Promise<boolean> {
  if (!pool) {
    console.log('[PostgreSQL] No DATABASE_URL provided. Operating in development repository mode.');
    return false;
  }

  try {
    const client = await pool.connect();
    try {
      const schemaPath = path.resolve(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('[PostgreSQL] Database schema verified and initialized successfully.');
        isConnected = true;
        return true;
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[PostgreSQL] Database connection failed. Will use in-memory store:', (err as Error).message);
    isConnected = false;
    return false;
  }
  return false;
}

export function isDatabaseConnected(): boolean {
  return isConnected && pool !== null;
}

export { pool };
