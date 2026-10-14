import test from 'node:test';
import assert from 'node:assert/strict';
import { beginMyfxbookActivityRequest, formatMyfxbookActivityAmount, getMyfxbookLoadState, mapMyfxbookAccountToDashboard, mapMyfxbookActivityToTrades, myfxbookHistoryNoticeCycle, myfxbookRealizedTradePnl, MyfxbookRequestError, MYFXBOOK_HISTORY_LIMIT, MYFXBOOK_HISTORY_NOTICE_MS, parseMyfxbookAccountsResponse, resolveActiveAccount, scheduleMyfxbookHistoryNotice, settleMyfxbookActivityRequest, tradesForAccount } from './myfxbookAccounts.ts';

const response = {
  success: true,
  data: {
    provider: 'Myfxbook',
    fetchedAt: '2026-10-14T12:00:00.000Z',
    timestampSemantics: 'Provider timestamps are preserved.',
    accounts: [{
      id: 42,
      mtAccountNumber: '123456',
      name: 'Primary',
      server: 'Broker-Server',
      currency: 'USD',
      demo: false,
      balance: 1050.25,
      equity: 1064.5,
      profit: 14.25,
      gain: 1.4,
      lastUpdateDate: '14.10.2026 12:00',
      sourceUpdatedAt: '14.10.2026 12:00',
    }],
  },
};

test('maps the deployed Myfxbook response without changing timestamp meaning', () => {
  const mapped = parseMyfxbookAccountsResponse(response);
  assert.equal(mapped.provider, 'Myfxbook');
  assert.equal(mapped.fetchedAt, '2026-10-14T12:00:00.000Z');
  assert.equal(mapped.accounts[0].id, '42');
  assert.equal(mapped.accounts[0].name, 'Primary');
  assert.equal(mapped.accounts[0].currency, 'USD');
  assert.equal(mapped.accounts[0].balance, 1050.25);
  assert.equal(mapped.accounts[0].equity, 1064.5);
  assert.equal(mapped.accounts[0].demo, false);
  assert.equal(mapped.accounts[0].sourceUpdatedAt, '14.10.2026 12:00');
});

test('leaves missing values unavailable instead of filling them with fabricated defaults', () => {
  const mapped = parseMyfxbookAccountsResponse({ success: true, data: { provider: 'Myfxbook', fetchedAt: '2026-10-14T12:00:00Z', accounts: [{ id: 'account-2' }] } });
  assert.equal(mapped.accounts[0].balance, undefined);
  assert.equal(mapped.accounts[0].equity, undefined);
  assert.equal(mapped.accounts[0].currency, undefined);
});

test('rejects malformed envelopes and account records', () => {
  assert.throws(() => parseMyfxbookAccountsResponse({ success: true, data: { provider: 'Other', accounts: [] } }), /unreadable response/);
  assert.throws(() => parseMyfxbookAccountsResponse({ success: true, data: { provider: 'Myfxbook', fetchedAt: 'now', accounts: [{}] } }), /unreadable account record/);
});

test('reports loading, authentication, provider, empty, and ready UI states', () => {
  const data = parseMyfxbookAccountsResponse(response);
  assert.equal(getMyfxbookLoadState({ loading: true, error: null, data: null }), 'loading');
  assert.equal(getMyfxbookLoadState({ loading: false, error: new MyfxbookRequestError('Sign in', 401), data: null }), 'authentication-error');
  assert.equal(getMyfxbookLoadState({ loading: false, error: new MyfxbookRequestError('Unavailable', 503), data: null }), 'provider-error');
  assert.equal(getMyfxbookLoadState({ loading: false, error: null, data: { ...data, accounts: [] } }), 'empty');
  assert.equal(getMyfxbookLoadState({ loading: false, error: null, data }), 'ready');
});

test('selects Myfxbook accounts by namespaced provider ID and filters activity to that account', () => {
  const first = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  const second = mapMyfxbookAccountToDashboard({ ...parseMyfxbookAccountsResponse(response).accounts[0], id: '43', name: first.name });
  assert.equal(resolveActiveAccount([first, second], second.id)?.id, 'myfxbook:43');
  assert.equal(resolveActiveAccount([first, second], 'unknown')?.id, first.id);
  const providerActivity = { provider: 'Myfxbook' as const, accountId: '42', fetchedAt: '2026-10-14T12:00:00.000Z', history: [{ openTime: '14.10.2026 10:00', closeTime: '14.10.2026 11:00', symbol: 'EURUSD', direction: 'Buy', size: 0.2, entryPrice: 1.1, exitPrice: 1.2, profit: 20 }], openTrades: [{ openTime: '14.10.2026 12:00', symbol: 'GBPUSD', direction: 'Sell', size: 0.1, floatingProfit: -2 }] };
  const mapped = mapMyfxbookActivityToTrades(first, providerActivity);
  assert.equal(mapped[0].accountId, first.id);
  assert.equal(mapped[0].entry, '1.1');
  assert.equal(mapped[0].exit, '1.2');
  assert.equal(mapped[0].pnlValue, 20);
  assert.equal(mapped[0].rValueAvailable, false);
  assert.equal(mapped[0].quality, 'Not recorded');
  assert.equal(mapped[1].tradeStatus, 'OPEN');
  assert.equal(mapped[1].outcome, 'OPEN');
  assert.deepEqual(tradesForAccount(mapped, second.id), []);
  assert.deepEqual(tradesForAccount(mapped, first.id), mapped);
  assert.deepEqual(mapMyfxbookActivityToTrades(first, providerActivity).map((trade) => trade.id), mapped.map((trade) => trade.id));
});

test('does not treat missing provider values as zero-valued realized performance', () => {
  const account = mapMyfxbookAccountToDashboard({ id: '44', provider: 'Myfxbook' });
  const mapped = mapMyfxbookActivityToTrades(account, { provider: 'Myfxbook', accountId: '44', fetchedAt: '2026-10-14T12:00:00.000Z', history: [{ symbol: 'XAUUSD' }], openTrades: [] });
  assert.equal(account.balanceAvailable, false);
  assert.equal(account.equityAvailable, false);
  assert.equal(mapped[0].outcome, 'UNKNOWN');
  assert.equal(mapped[0].pnlAvailable, false);
  assert.equal(mapped[0].entry, '');
  assert.equal(mapped[0].rValueAvailable, false);
  assert.equal(mapped[0].netPnl, 'Unavailable');
});

test('history refresh keeps successful records visible until a valid replacement arrives', () => {
  const account = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  const trades = mapMyfxbookActivityToTrades(account, {
    provider: 'Myfxbook', accountId: '42', fetchedAt: '2026-10-14T12:00:00.000Z',
    history: [{ symbol: 'EURUSD', direction: 'Buy', profit: 24 }], openTrades: [],
  });
  const loaded = { 'myfxbook:42': { trades, loading: false, error: null, loaded: true, requestId: 1 } };
  const refreshing = beginMyfxbookActivityRequest(loaded, 'myfxbook:42', 2);
  assert.equal(refreshing['myfxbook:42'].loading, true);
  assert.deepEqual(refreshing['myfxbook:42'].trades, trades);

  const failed = settleMyfxbookActivityRequest(refreshing, 'myfxbook:42', 2, 'myfxbook:42', { error: new MyfxbookRequestError('Unavailable', 502) });
  assert.deepEqual(failed['myfxbook:42'].trades, trades);
  assert.equal(failed['myfxbook:42'].loaded, true);
  assert.equal(failed['myfxbook:42'].error?.status, 502);
});

test('successful empty history is loaded and distinct from a failed first request', () => {
  const loading = beginMyfxbookActivityRequest({}, 'myfxbook:42', 1);
  const failed = settleMyfxbookActivityRequest(loading, 'myfxbook:42', 1, 'myfxbook:42', { error: new MyfxbookRequestError('Unavailable', 502) });
  assert.equal(failed['myfxbook:42'].loaded, false);
  assert.equal(failed['myfxbook:42'].error?.status, 502);

  const emptyLoading = beginMyfxbookActivityRequest({}, 'myfxbook:43', 1);
  const empty = settleMyfxbookActivityRequest(emptyLoading, 'myfxbook:43', 1, 'myfxbook:43', { trades: [] });
  assert.equal(empty['myfxbook:43'].loaded, true);
  assert.deepEqual(empty['myfxbook:43'].trades, []);
  assert.equal(empty['myfxbook:43'].error, null);
  assert.equal(empty['myfxbook:43'].loading, false);
});

test('stale requests and responses for a previously selected account cannot replace current history', () => {
  const account = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  const oldTrade = mapMyfxbookActivityToTrades(account, { provider: 'Myfxbook', accountId: '42', fetchedAt: 'old', history: [{ symbol: 'EURUSD', direction: 'Buy', profit: 1 }], openTrades: [] })[0];
  const currentTrade = mapMyfxbookActivityToTrades(account, { provider: 'Myfxbook', accountId: '42', fetchedAt: 'new', history: [{ symbol: 'EURUSD', direction: 'Buy', profit: 2 }], openTrades: [] })[0];
  const firstRequest = beginMyfxbookActivityRequest({ 'myfxbook:42': { trades: [oldTrade], loading: false, error: null, loaded: true, requestId: 1 } }, 'myfxbook:42', 2);
  const secondRequest = beginMyfxbookActivityRequest(firstRequest, 'myfxbook:42', 3);
  const staleSameAccount = settleMyfxbookActivityRequest(secondRequest, 'myfxbook:42', 2, 'myfxbook:42', { trades: [oldTrade] });
  assert.equal(staleSameAccount, secondRequest);
  const stalePreviousSelection = settleMyfxbookActivityRequest(secondRequest, 'myfxbook:42', 3, 'myfxbook:43', { trades: [oldTrade] });
  assert.equal(stalePreviousSelection, secondRequest);
  const accepted = settleMyfxbookActivityRequest(secondRequest, 'myfxbook:42', 3, 'myfxbook:42', { trades: [currentTrade] });
  assert.deepEqual(accepted['myfxbook:42'].trades, [currentTrade]);
});

test('Myfxbook realized trade P&L sums the trade result and separate costs once, never account balance', () => {
  const account = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  assert.equal(account.currentBalance, 1050.25);
  assert.equal(account.netProfit, 14.25); // provider aggregate, displayed separately from closed-trade P&L
  const activity = {
    provider: 'Myfxbook' as const, accountId: '42', fetchedAt: '2026-10-14T12:00:00.000Z',
    history: [
      { symbol: 'EURUSD', direction: 'Buy Limit', profit: 100, commission: -2, interest: 1, swap: 1 },
      { symbol: '', direction: 'Balance', profit: 1050.25 },
      { symbol: 'USD', direction: 'Credit', profit: 500 },
    ],
    openTrades: [],
  };
  const mapped = mapMyfxbookActivityToTrades(account, activity);
  assert.equal(myfxbookRealizedTradePnl(activity.history[0]), 99);
  assert.equal(mapped[0].side, 'BUY');
  assert.equal(mapped[0].pnlValue, 99);
  assert.deepEqual(mapped.slice(1).map((trade) => [trade.instrument, trade.activityType, trade.outcome, trade.pnlAvailable]), [['Deposit', 'DEPOSIT', 'UNKNOWN', false], ['Credit', 'OTHER', 'UNKNOWN', false]]);
  const closedPerformance = mapped.filter((trade) => trade.tradeStatus !== 'OPEN' && trade.pnlAvailable !== false && ['WIN', 'LOSS', 'BE'].includes(trade.outcome));
  assert.equal(closedPerformance.reduce((total, trade) => total + trade.pnlValue, 0), 99);
  assert.notEqual(closedPerformance[0].pnlValue, account.currentBalance);
  assert.equal(myfxbookRealizedTradePnl({ symbol: 'EURUSD', direction: 'Sell', profit: 100, commission: -2, swap: -1 }), 97, 'swap is used when the documented interest field is absent');
});

test('keeps provider account profit separate from filtered closed-trade realized results', () => {
  const account = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  const activity = { provider: 'Myfxbook' as const, accountId: '42', fetchedAt: '2026-10-14T12:00:00.000Z', history: [
    { symbol: 'EURUSD', direction: 'Buy', profit: 12, commission: -1, interest: 0.25 },
    { direction: 'Deposit', profit: 1050.25 },
  ], openTrades: [] };
  const records = mapMyfxbookActivityToTrades(account, activity);
  assert.equal(account.netProfit, 14.25);
  assert.equal(myfxbookRealizedTradePnl(activity.history[0]), 11.25);
  assert.notEqual(account.netProfit, records[0].pnlValue);
  assert.equal(records[1].activityType, 'DEPOSIT');
  assert.equal(records[1].pnlAvailable, false);
});

test('classifies funding transactions as signed activity amounts and never trading outcomes', () => {
  const account = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  const mapped = mapMyfxbookActivityToTrades(account, {
    provider: 'Myfxbook', accountId: '42', fetchedAt: '2026-10-14T12:00:00.000Z', openTrades: [],
    history: [
      { direction: 'Deposit', profit: -500, openTime: '10/01/2026 09:00', closeTime: '10/01/2026 09:00' },
      { direction: 'Withdrawal', profit: 125, openTime: '10/02/2026 09:00', closeTime: '10/02/2026 09:00' },
      { direction: 'Withdrawal', profit: -25, openTime: '10/03/2026 09:00', closeTime: '10/03/2026 09:00' },
      { direction: 'Balance', profit: 750, openTime: '10/04/2026 09:00', closeTime: '10/04/2026 09:00' },
      { direction: 'Balance', profit: -80, openTime: '10/05/2026 09:00', closeTime: '10/05/2026 09:00' },
    ],
  });
  assert.deepEqual(mapped.map((record) => [record.activityType, record.instrument, record.activityAmount, record.pnlAvailable, record.outcome]), [
    ['DEPOSIT', 'Deposit', 500, false, 'UNKNOWN'],
    ['WITHDRAWAL', 'Withdrawal', -125, false, 'UNKNOWN'],
    ['WITHDRAWAL', 'Withdrawal', -25, false, 'UNKNOWN'],
    ['DEPOSIT', 'Deposit', 750, false, 'UNKNOWN'],
    ['WITHDRAWAL', 'Withdrawal', -80, false, 'UNKNOWN'],
  ]);
  assert.equal(formatMyfxbookActivityAmount(mapped[0].activityAmount || 0, account.currency), '+$500.00');
  assert.equal(formatMyfxbookActivityAmount(mapped[1].activityAmount || 0, account.currency), '−$125.00');
  assert.equal(account.startingBalanceAvailable, false, 'a limited history sample cannot establish an original funding event');
});

test('uses a manually configured starting balance and NOVA account metadata without changing provider values', () => {
  const myfx = parseMyfxbookAccountsResponse({ ...response, data: { ...response.data, accounts: [{ ...response.data.accounts[0], novaDisplayName: 'Funded NOVA label', novaSettings: { classification: 'PROP_FIRM', starting_balance: 100000, prop_firm_name: 'Firm', challenge: { type: 'TWO_STEP', stage: 'PHASE_2', phase2_target_percent: 5 } } }] } });
  const account = mapMyfxbookAccountToDashboard(myfx.accounts[0]);
  assert.equal(account.name, 'Funded NOVA label');
  assert.equal(account.baseBalance, 100000);
  assert.equal(account.startingBalanceAvailable, true);
  assert.equal(account.currentBalance, 1050.25);
  assert.equal(account.classification, 'PROP_FIRM');
  assert.equal(account.accountSettings?.challenge?.stage, 'PHASE_2');
});

test('history-unavailable notice is deduplicated by fetch cycle and dismisses after one second', () => {
  const error = new MyfxbookRequestError('History unavailable', 503);
  assert.equal(myfxbookHistoryNoticeCycle('myfxbook:42', 8, error), myfxbookHistoryNoticeCycle('myfxbook:42', 8, error));
  assert.notEqual(myfxbookHistoryNoticeCycle('myfxbook:42', 8, error), myfxbookHistoryNoticeCycle('myfxbook:42', 9, error));
  assert.equal(MYFXBOOK_HISTORY_NOTICE_MS, 1000);
  let shown: string | null = null;
  let delay = 0;
  let dismiss: () => void = () => {};
  const fakeSchedule = ((callback: () => void, ms: number) => { delay = ms; dismiss = callback; return 1; }) as unknown as typeof setTimeout;
  const cancelNotice = scheduleMyfxbookHistoryNotice((message) => { shown = message; }, error.message, fakeSchedule, (() => undefined) as typeof clearTimeout);
  assert.equal(shown, error.message);
  assert.equal(delay, 1000);
  dismiss();
  assert.equal(shown, null);
  cancelNotice();
});

test('provider history coverage is explicitly capped and repeated valid refreshes replace rather than append records', () => {
  assert.equal(MYFXBOOK_HISTORY_LIMIT, 50);
  const account = mapMyfxbookAccountToDashboard(parseMyfxbookAccountsResponse(response).accounts[0]);
  const activity = { provider: 'Myfxbook' as const, accountId: '42', fetchedAt: '2026-10-14T12:00:00.000Z', history: [{ symbol: 'EURUSD', direction: 'Sell', profit: -3 }], openTrades: [] };
  const first = mapMyfxbookActivityToTrades(account, activity);
  const refreshing = beginMyfxbookActivityRequest({ 'myfxbook:42': { trades: first, loading: false, error: null, loaded: true, requestId: 1 } }, 'myfxbook:42', 2);
  assert.deepEqual(refreshing['myfxbook:42'].trades.map((trade) => trade.id), first.map((trade) => trade.id));
  const replaced = settleMyfxbookActivityRequest(refreshing, 'myfxbook:42', 2, 'myfxbook:42', { trades: mapMyfxbookActivityToTrades(account, activity) });
  assert.equal(replaced['myfxbook:42'].trades.length, 1);
  assert.equal(replaced['myfxbook:42'].trades[0].id, first[0].id);
});
