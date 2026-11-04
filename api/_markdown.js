// api/_markdown.js - strips markdown to plain letter text (pure, Edge/Node/browser-safe).
// Used by api/generate.js (before lint and before the reply) and by src/App.jsx (before display, copy, email and PDF).
// A signature line of underscores ("________") and ordinary punctuation (asterisks in "5 * 3" with spaces, snake_case) are left alone.
export function stripMarkdown(input) {
  let s = String(input == null ? '' : input).replace(/\r\n?/g, '\n');
  // code fences: drop the fence lines, keep the content
  s = s.replace(/^[ \t]*(```|~~~)[^\n]*\n?/gm, '');
  // horizontal rules
  s = s.replace(/^[ \t]*([-*])([ \t]*\1){2,}[ \t]*$/gm, '');
  // tables: remove separator rows, turn "| a | b |" into "a, b"
  s = s.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, m => (m.includes('|') ? '' : m));
  s = s.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (m, row) => row.split('|').map(c => c.trim()).filter(Boolean).join(', '));
  // headings and blockquotes
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '').replace(/^[ \t]{0,3}>[ \t]?/gm, '');
  // bullets: "* item" / "+ item" / "- item" -> "- item" (numbered lists are already plain text)
  s = s.replace(/^([ \t]*)[*+-][ \t]+(?=\S)/gm, '$1- ');
  // links and images
  s = s.replace(/!?\[([^\]\n]+)\]\((?:[^)\n]*)\)/g, '$1');
  // bold, then italic, then inline code
  s = s.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1').replace(/__(?=[^\s_])([^_\n]*?[^\s_])__/g, '$1');
  s = s.replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g, '$1$2');
  s = s.replace(/(^|[^_\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?![_\w])/g, '$1$2');
  s = s.replace(/`([^`\n]+)`/g, '$1');
  // leftover emphasis markers around a word at line edges, then spacing
  s = s.replace(/\*\*+/g, '');
  return s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
