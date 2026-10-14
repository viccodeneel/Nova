import { Router, type Request, type Response } from 'express';
import { requireStrictAuth } from './auth.ts';
import { createMyfxbookService, MyfxbookServiceError } from '../services/myfxbookService.ts';
import { createMyfxbookAccountSettingsStore, type MyfxbookAccountSettingsStore } from '../services/myfxbookAccountSettings.ts';

const classifications = ['LIVE_BROKERAGE', 'PROP_FIRM', 'DEMO'] as const;
const challengeTypes = ['ONE_STEP', 'TWO_STEP', 'INSTANT_FUNDING'] as const;
const challengeStages = ['PHASE_1', 'PHASE_2', 'FUNDED', 'INSTANT_FUNDED', 'EVALUATION'] as const;
type ProviderAccount = { id: string; demo?: boolean };

function validOptionalNumber(value: unknown, min: number, max: number, integer = false): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
}

function validateSettings(body: unknown, providerAccount?: ProviderAccount): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Account name and settings are required.';
  const payload = body as Record<string, unknown>;
  const name = typeof payload.account_name === 'string' ? payload.account_name.trim() : '';
  const settings = payload.account_settings;
  if (!name || name.length > 100 || !settings || typeof settings !== 'object' || Array.isArray(settings)) return 'A valid account name and settings object are required.';
  const value = settings as Record<string, unknown>;
  if (!classifications.some((item) => item === value.classification)) return 'Choose a supported account classification.';
  if (providerAccount?.demo === true && value.classification === 'LIVE_BROKERAGE') return 'A Myfxbook demo account cannot be classified as Live Brokerage.';
  if (providerAccount?.demo === false && value.classification === 'DEMO') return 'A Myfxbook live account cannot be classified as Demo.';
  if (value.notes != null && (typeof value.notes !== 'string' || value.notes.length > 1000)) return 'Notes must be 1,000 characters or fewer.';
  if (value.prop_firm_name != null && (typeof value.prop_firm_name !== 'string' || value.prop_firm_name.trim().length > 100)) return 'Firm name must be 100 characters or fewer.';
  if (value.starting_balance != null && !validOptionalNumber(value.starting_balance, 0.01, 1_000_000_000_000)) return 'Manual starting balance must be a positive amount.';
  const challenge = value.challenge;
  if (challenge == null) return null;
  if (typeof challenge !== 'object' || Array.isArray(challenge)) return 'Challenge settings must be an object.';
  const submitted = challenge as Record<string, unknown>;
  if (submitted.type != null && !challengeTypes.some((item) => item === submitted.type)) return 'Choose a supported challenge type.';
  if (submitted.stage != null && !challengeStages.some((item) => item === submitted.stage)) return 'Choose a supported challenge stage.';
  const type = submitted.type;
  const stage = submitted.stage;
  if ((type === 'ONE_STEP' && (stage === 'PHASE_2' || stage === 'INSTANT_FUNDED')) ||
      (type === 'TWO_STEP' && stage === 'INSTANT_FUNDED') ||
      (type === 'INSTANT_FUNDING' && stage !== 'FUNDED' && stage !== 'INSTANT_FUNDED' && stage != null)) return 'Challenge stage does not match the selected challenge type.';
  const numericFields: Array<[string, number, number, boolean?]> = [
    ['fee', 0, 1_000_000], ['size', 0.01, 1_000_000_000],
    ['phase1_target_percent', 0.01, 100], ['phase2_target_percent', 0.01, 100],
    ['daily_drawdown_percent', 0.01, 100], ['max_drawdown_percent', 0.01, 100],
    ['minimum_trading_days', 0, 365, true],
  ];
  for (const [key, min, max, integer] of numericFields) if (!validOptionalNumber(submitted[key], min, max, integer)) return `Challenge setting ${key} is outside its allowed range.`;
  if (type === 'TWO_STEP' && submitted.phase2_target_percent == null) return 'A Phase 2 target is required for a two-step challenge.';
  if (type === 'INSTANT_FUNDING' && (stage === 'PHASE_1' || stage === 'PHASE_2')) return 'Instant funding does not have evaluation phases.';
  return null;
}

export function createMyfxbookRouter(
  service = createMyfxbookService(),
  settingsStore: MyfxbookAccountSettingsStore = createMyfxbookAccountSettingsStore(),
) {
  const router = Router();
  router.use(requireStrictAuth);
  // The authenticated dashboard fetches this list before allowing account
  // editing. Reuse its server-verified provider metadata for the subsequent
  // NOVA-only settings save instead of requiring a second Myfxbook login.
  const verifiedAccounts = new Map<string, ProviderAccount>();

  const respondWithSafeError = (error: unknown, res: Response) => {
    const code = error instanceof MyfxbookServiceError ? error.code : 'UPSTREAM_FAILURE';
    const status = code === 'NOT_CONFIGURED' ? 503
      : code === 'INVALID_ACCOUNT_ID' ? 400
        : code === 'ACCOUNT_NOT_FOUND' ? 404
          : code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
    const messages: Record<string, string> = {
      NOT_CONFIGURED: 'Myfxbook integration is not configured.',
      INVALID_ACCOUNT_ID: 'A valid Myfxbook account ID is required.',
      ACCOUNT_NOT_FOUND: 'The selected account is not available for this NOVA owner.',
      UPSTREAM_TIMEOUT: 'Myfxbook did not respond in time. Try again shortly.',
      UPSTREAM_FAILURE: 'Myfxbook could not provide the requested data.',
      INVALID_SESSION: 'The Myfxbook session was rejected. Please retry the request.',
      INVALID_RESPONSE: 'Myfxbook returned data NOVA could not safely read.',
    };
    res.status(status).json({ success: false, error: messages[code] || messages.UPSTREAM_FAILURE });
  };

  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: { provider: 'Myfxbook', configured: service.isConfigured(), readOnly: true },
    });
  });

  router.get('/accounts', async (_req: Request, res: Response) => {
    try {
      const result = await service.getAccounts();
      verifiedAccounts.clear();
      for (const account of result.accounts) verifiedAccounts.set(account.id, account);
      const saved = await settingsStore.getAll();
      res.json({ success: true, data: { ...result, accounts: result.accounts.map((account) => ({
        ...account,
        ...(saved[account.id] ? { novaDisplayName: saved[account.id].account_name, novaSettings: saved[account.id].account_settings } : {}),
      })) } });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  router.patch('/accounts/:id/settings', async (req: Request, res: Response) => {
    let stage: 'provider-verification' | 'settings-read' | 'settings-write' = 'provider-verification';
    try {
      const accountId = req.params.id;
      if (!/^\d{1,20}$/.test(accountId)) return res.status(400).json({ success: false, error: 'A valid Myfxbook account ID is required.' });
      const shapeError = validateSettings(req.body);
      if (shapeError) return res.status(400).json({ success: false, error: shapeError });
      let providerAccount = verifiedAccounts.get(accountId);
      if (!providerAccount) {
        const accounts = await service.getAccounts();
        verifiedAccounts.clear();
        for (const account of accounts.accounts) verifiedAccounts.set(account.id, account);
        providerAccount = verifiedAccounts.get(accountId);
      }
      if (!providerAccount) return res.status(404).json({ success: false, error: 'The selected account is not available for this NOVA owner.' });
      const validationError = validateSettings(req.body, providerAccount);
      if (validationError) return res.status(400).json({ success: false, error: validationError });
      const body = req.body as { account_name: string; account_settings: Record<string, unknown> };
      const incoming = body.account_settings;
      const settings: Record<string, unknown> = {
        classification: incoming.classification,
        notes: typeof incoming.notes === 'string' ? incoming.notes.trim() || null : null,
        prop_firm_name: typeof incoming.prop_firm_name === 'string' ? incoming.prop_firm_name.trim() || null : null,
        ...(incoming.starting_balance == null ? {} : { starting_balance: incoming.starting_balance }),
      };
      const challenge = incoming.challenge;
      if (challenge && typeof challenge === 'object' && !Array.isArray(challenge)) {
        stage = 'settings-read';
        const existing = (await settingsStore.getAll())[accountId]?.account_settings.challenge;
        const allowedChallengeFields = ['type', 'stage', 'fee', 'size', 'phase1_target_percent', 'phase2_target_percent', 'daily_drawdown_percent', 'max_drawdown_percent', 'minimum_trading_days'];
        const submitted = Object.fromEntries(Object.entries(challenge as Record<string, unknown>).filter(([key]) => allowedChallengeFields.includes(key)));
        settings.challenge = { ...(existing && typeof existing === 'object' ? existing : {}), ...submitted };
      }
      stage = 'settings-write';
      await settingsStore.save(accountId, { account_name: body.account_name.trim(), account_settings: settings });
      res.json({ success: true, data: { id: accountId, novaDisplayName: body.account_name.trim(), novaSettings: settings } });
    } catch (error) {
      if (error instanceof MyfxbookServiceError) {
        if (stage === 'provider-verification') {
          const status = error.code === 'NOT_CONFIGURED' ? 503 : error.code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
          return res.status(status).json({ success: false, error: 'Could not verify the selected account with Myfxbook. Refresh the account list and try again.' });
        }
        return respondWithSafeError(error, res);
      }
      const details = error as { name?: unknown; code?: unknown };
      console.error('[Myfxbook settings] persistence failed', {
        stage,
        errorType: typeof details?.name === 'string' ? details.name : 'Error',
        databaseCode: typeof details?.code === 'string' ? details.code : undefined,
      });
      res.status(503).json({ success: false, error: 'NOVA could not save these account settings. Check the database migration and try again.' });
    }
  });

  router.get('/accounts/:id/open-trades', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await service.getOpenTrades(req.params.id) });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  router.get('/accounts/:id/history', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await service.getHistory(req.params.id) });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  router.get('/diagnostic/:id', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await service.getDiagnostic(req.params.id) });
    } catch (error) {
      respondWithSafeError(error, res);
    }
  });

  return router;
}

export default createMyfxbookRouter;
