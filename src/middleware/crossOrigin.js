import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Allows the configured client origins. SameSite=None cookies are also sent on requests
// from other sites, so those are refused here when they could change data.
export function crossOrigin(req, res, next) {
  if (!env.clientOrigins.length) return next();

  res.vary('Origin');
  const { origin } = req.headers;
  if (!origin) return next();

  if (!env.clientOrigins.includes(origin)) {
    if (SAFE_METHODS.has(req.method)) return next();
    throw new HttpError(403, 'This site is not allowed to use the API.');
  }

  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '600');
    return res.sendStatus(204);
  }
  next();
}
