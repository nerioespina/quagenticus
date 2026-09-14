// Reference grammar shared with db/md/md_functions.sql:
//   #123  @123  #KEY-123  KEY-123   → requirement
//   [[Title]]  [[slug|alias]]        → document (wikilink)
//   @handle                          → user mention
// Code spans and fenced blocks are ignored.

export type RefToken =
  | { type: 'text'; value: string }
  | { type: 'requirement'; raw: string; key: string } // key: "123" or "KEY-123"
  | { type: 'wikilink'; raw: string; target: string; alias: string | null }
  | { type: 'user'; raw: string; handle: string };

const PATTERN = new RegExp(
  [
    String.raw`\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]`, // 1 target, 2 alias
    String.raw`(^|[^\p{L}\p{N}_/&#@])[#@](?:([A-Z][A-Z0-9]{1,9})-)?(\d{1,9})(?![\p{L}\p{N}_-])`, // 3 prefix, 4 key, 5 num
    String.raw`(^|[^\p{L}\p{N}_/#@.-])([A-Z][A-Z0-9]{1,9})-(\d{1,9})(?![\p{L}\p{N}_-])`, // 6 prefix, 7 key, 8 num
    String.raw`(^|[^\p{L}\p{N}_/@.])@([A-Za-z][A-Za-z0-9._-]{0,39})`, // 9 prefix, 10 handle
  ].join('|'),
  'gu',
);

/** Splits plain text (no code) into text and reference tokens. */
export function tokenizeRefs(text: string): RefToken[] {
  const out: RefToken[] = [];
  let last = 0;
  const push = (value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text') prev.value += value;
    else out.push({ type: 'text', value });
  };
  for (const m of text.matchAll(PATTERN)) {
    const index = m.index ?? 0;
    if (m[1] !== undefined) {
      push(text.slice(last, index));
      out.push({ type: 'wikilink', raw: m[0], target: m[1].trim(), alias: m[2]?.trim() || null });
      last = index + m[0].length;
    } else if (m[5] !== undefined) {
      const prefix = m[3] ?? '';
      push(text.slice(last, index + prefix.length));
      const raw = m[0].slice(prefix.length);
      out.push({ type: 'requirement', raw, key: m[4] ? `${m[4]}-${m[5]}` : m[5] });
      last = index + m[0].length;
    } else if (m[8] !== undefined) {
      const prefix = m[6] ?? '';
      push(text.slice(last, index + prefix.length));
      out.push({ type: 'requirement', raw: `${m[7]}-${m[8]}`, key: `${m[7]}-${m[8]}` });
      last = index + m[0].length;
    } else if (m[10] !== undefined) {
      const prefix = m[9] ?? '';
      let handle = m[10];
      let trailing = '';
      while (/[._-]$/.test(handle)) {
        trailing = handle.slice(-1) + trailing;
        handle = handle.slice(0, -1);
      }
      push(text.slice(last, index + prefix.length));
      out.push({ type: 'user', raw: `@${handle}`, handle: handle.toLowerCase() });
      push(trailing);
      last = index + m[0].length;
    }
  }
  push(text.slice(last));
  return out;
}

/** Removes fenced code blocks and inline code before scanning. */
export function stripCode(markdown: string): string {
  return markdown.replace(/(```|~~~)[\s\S]*?(\1|$)/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

export interface ExtractedRefs {
  requirements: string[];
  wikilinks: string[];
  users: string[];
  attachments: string[];
}

export function extractRefs(markdown: string): ExtractedRefs {
  const req = new Set<string>();
  const wiki = new Set<string>();
  const users = new Set<string>();
  const clean = stripCode(markdown ?? '');
  for (const t of tokenizeRefs(clean)) {
    if (t.type === 'requirement') req.add(t.key);
    else if (t.type === 'wikilink') wiki.add(t.target);
    else if (t.type === 'user') users.add(t.handle);
  }
  const attachments = new Set<string>();
  for (const m of (markdown ?? '').matchAll(/attachment:([0-9a-f-]{36})/gi)) attachments.add(m[1].toLowerCase());
  return { requirements: [...req], wikilinks: [...wiki], users: [...users], attachments: [...attachments] };
}

export type TriggerKind = 'hash' | 'at' | 'wiki';
export interface ActiveTrigger {
  kind: TriggerKind;
  query: string;
  start: number; // index where the trigger starts (inclusive)
  end: number; // caret
}

/** Detects an autocomplete trigger right before the caret. */
export function detectTrigger(value: string, caret: number): ActiveTrigger | null {
  const before = value.slice(0, caret);
  const wiki = /\[\[([^\]\n]{0,60})$/.exec(before);
  if (wiki) return { kind: 'wiki', query: wiki[1], start: caret - wiki[0].length, end: caret };
  const m = /(^|[\s([{>,;:!¡¿?])([#@])([\p{L}\p{N}._-]{0,40})$/u.exec(before);
  if (!m) return null;
  const start = caret - m[3].length - 1;
  return { kind: m[2] === '#' ? 'hash' : 'at', query: m[3], start, end: caret };
}

export function suggestTypesFor(trigger: ActiveTrigger): string[] {
  if (trigger.kind === 'wiki') return ['document', 'requirement'];
  if (trigger.kind === 'hash') return ['requirement'];
  return /^\d/.test(trigger.query) ? ['requirement'] : ['user', 'requirement'];
}
