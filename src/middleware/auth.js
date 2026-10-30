import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';

export const COOKIE_NAME = 'vwt_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieOptions() {
  // A client on another site only gets the cookie with SameSite=None, which requires Secure.
  const crossSite = env.isProduction && env.clientOrigins.length > 0;
  return { httpOnly: true, sameSite: crossSite ? 'none' : 'lax', secure: env.isProduction, path: '/' };
}

export function setSession(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: MAX_AGE_MS / 1000,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new HttpError(401, 'Please log in.');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Your session has expired. Please log in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, 'Please log in.');
  req.user = user;
  next();
}
