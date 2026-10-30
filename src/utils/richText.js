import sanitizeHtml from 'sanitize-html';

const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'h3', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

// Descriptions and final summaries arrive as HTML from the editor, so only a safe set of formatting is kept.
export function sanitizeRichText(value) {
  const clean = sanitizeHtml(value, OPTIONS).trim();
  const hasText = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).trim() !== '';
  return hasText || clean.includes('<hr') ? clean : '';
}
