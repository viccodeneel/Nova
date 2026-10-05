import { Router, type Request, type Response } from 'express';
import { getTradesByAccount, updateTradeConfluences } from '../services/tradeService.ts';

const router = Router();

// GET /api/trades - List all trades (optional query: ?account_id=...)
router.get('/', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.account_id as string | undefined;
    const trades = await getTradesByAccount(accountId);
    res.json({ success: true, count: trades.length, data: trades });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/trades/:id - Get trade by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const trades = await getTradesByAccount();
    const trade = trades.find(
      (t) => t.id === req.params.id || t.primary_ticket.toString() === req.params.id
    );
    if (!trade) {
      return res.status(404).json({ success: false, error: 'Trade not found' });
    }
    res.json({ success: true, data: trade });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /api/trades/:id - Update DLM checklist confluences, notes, flags
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const confluences = req.body;
    const updated = await updateTradeConfluences(req.params.id, confluences);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Trade not found' });
    }
    res.json({
      success: true,
      message: 'Trade confluences and journal notes updated successfully.',
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
