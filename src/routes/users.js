import { Router } from 'express';
import { User } from '../models/User.js';

const router = Router();

router.get('/', async (_req, res) => {
  const users = await User.find().select('name email').sort({ name: 1 }).lean();
  res.json({ users: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email })) });
});

export default router;
