import { Router, type Request, type Response } from 'express';
import { CATEGORIES, createItem, listItems, removeItem, updateValue } from '../services/financeService.ts';

const router = Router();
const validValue = (v: unknown) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1e12;
const fail = (res: Response, err: unknown) => res.status(500).json({ success: false, error: (err as Error).message });

router.get('/', async (_req: Request, res: Response) => {
  try { res.json({ success: true, data: await listItems() }); } catch (e) { fail(res, e); }
});

router.post('/', async (req: Request, res: Response) => {
  const { kind, category, name, value } = req.body || {};
  const n = typeof name === 'string' ? name.trim() : '';
  if (!(kind in CATEGORIES) || !CATEGORIES[kind as 'asset' | 'liability'].includes(category) || !n || n.length > 100 || !validValue(value)) {
    return res.status(400).json({ success: false, error: 'Valid kind, category, name (max 100 chars) and a non-negative value are required' });
  }
  try { res.status(201).json({ success: true, data: await createItem({ kind, category, name: n, value: Number(value) }) }); } catch (e) { fail(res, e); }
});

router.patch('/:id', async (req: Request, res: Response) => {
  if (!validValue(req.body?.value)) return res.status(400).json({ success: false, error: 'A non-negative value is required' });
  try {
    const item = await updateValue(req.params.id, Number(req.body.value));
    item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, error: 'Item not found' });
  } catch (e) { fail(res, e); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    (await removeItem(req.params.id)) ? res.json({ success: true }) : res.status(404).json({ success: false, error: 'Item not found' });
  } catch (e) { fail(res, e); }
});

export default router;
