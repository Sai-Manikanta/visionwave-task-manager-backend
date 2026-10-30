import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { dailyReport, weeklyReport } from '../services/reports.js';
import { today } from '../utils/dates.js';
import { reportQuerySchema } from '../validators/index.js';

const router = Router();

router.get('/daily', validate(reportQuerySchema, 'query'), async (req, res) => {
  res.json({ today: today(), report: await dailyReport(req.valid.query.date) });
});

router.get('/weekly', validate(reportQuerySchema, 'query'), async (req, res) => {
  res.json({ today: today(), report: await weeklyReport(req.valid.query.date) });
});

export default router;
