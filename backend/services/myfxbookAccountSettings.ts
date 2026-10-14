import { isDatabaseConnected, query } from '../../database/db.ts';

export interface SavedMyfxbookAccountSettings {
  account_name: string;
  account_settings: Record<string, unknown>;
}

export interface MyfxbookAccountSettingsStore {
  getAll(): Promise<Record<string, SavedMyfxbookAccountSettings>>;
  save(accountId: string, settings: SavedMyfxbookAccountSettings): Promise<void>;
}

export interface MyfxbookSettingsDatabase {
  isConnected(): boolean;
  query: typeof query;
}

const memorySettings: Record<string, SavedMyfxbookAccountSettings> = {};

async function ensureProfileRow(database: MyfxbookSettingsDatabase): Promise<void> {
  await database.query('INSERT INTO app_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
}

export function createMyfxbookAccountSettingsStore(
  database: MyfxbookSettingsDatabase = { isConnected: isDatabaseConnected, query },
): MyfxbookAccountSettingsStore {
  return {
    async getAll() {
      if (!database.isConnected()) return { ...memorySettings };
      await ensureProfileRow(database);
      const result = await database.query<{ provider_account_settings: Record<string, SavedMyfxbookAccountSettings> | null }>(
        'SELECT provider_account_settings FROM app_profile WHERE id = 1'
      );
      if (!result) throw new Error('Could not read saved Myfxbook account settings.');
      return result.rows[0]?.provider_account_settings || {};
    },
    async save(accountId, settings) {
      if (!database.isConnected()) {
        memorySettings[accountId] = settings;
        return;
      }
      await ensureProfileRow(database);
      const result = await database.query(
        `UPDATE app_profile
         SET provider_account_settings = COALESCE(provider_account_settings, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [accountId, JSON.stringify(settings)]
      );
      if (!result) throw new Error('Could not save Myfxbook account settings.');
    },
  };
}
