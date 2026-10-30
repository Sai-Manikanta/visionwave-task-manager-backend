import { HttpError } from '../utils/httpError.js';

// Validated input lands on req.valid, since Express 5 makes req.query read-only.
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message;
      }
      throw new HttpError(400, 'Please check the highlighted fields.', fields);
    }
    req.valid = { ...req.valid, [source]: result.data };
    next();
  };
}
