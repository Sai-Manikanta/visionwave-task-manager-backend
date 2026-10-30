import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { COOKIE_NAME, cookieOptions, requireAuth, setSession } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { loginSchema, registerSchema } from '../validators/index.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Compared against when the email is unknown, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const digest = (value) => createHash('sha256').update(value).digest();
const signupCodeMatches = (code) => timingSafeEqual(digest(code), digest(env.signupCode));

const publicUser = (user) => ({ id: String(user._id), name: user.name, email: user.email });

router.post('/register', limiter, validate(registerSchema), async (req, res) => {
  const { name, email, password, signupCode } = req.valid.body;
  if (!signupCodeMatches(signupCode)) {
    throw new HttpError(403, 'That signup code is not correct.', {
      signupCode: 'That signup code is not correct.',
    });
  }
  if (await User.exists({ email })) {
    throw new HttpError(409, 'An account with this email already exists.', {
      email: 'An account with this email already exists.',
    });
  }
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  setSession(res, user._id);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', limiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, 'Incorrect email or password.');
  setSession(res, user._id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ message: 'Logged out.' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
