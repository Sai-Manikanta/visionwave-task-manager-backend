import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError.js';

export function notFound(req, _res, next) {
  next(new HttpError(404, `Not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, fields: err.fields });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ message: 'That record was not found.' });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return res.status(400).json({ message: 'Please check the highlighted fields.', fields });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'That record already exists.' });
  }
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(err.status).json({ message: 'The request could not be read.' });
  }
  console.error(err);
  return res.status(500).json({ message: 'Something went wrong on the server. Please try again.' });
}
