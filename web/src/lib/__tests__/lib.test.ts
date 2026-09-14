import { describe, expect, it } from 'vitest';
import { detectTrigger, extractRefs, tokenizeRefs } from '../refs';
import { diffLines } from '../diff';
import { arrayMove, neighbours } from '../boardOrder';
import { daysUntil, parseDateOnly, todayISO } from '../dates';

describe('refs grammar (mirrors md_extract_req_refs)', () => {
  it('finds requirement references', () => {
    const refs = extractRefs('ver #12, @34 y #DEMO-7 o DEMO-9; no a@5 ni UTF-8x ni url/#3 `#99`\n```\n#100\n```');
    expect(refs.requirements.sort()).toEqual(['12', '34', 'DEMO-7', 'DEMO-9'].sort());
  });
  it('finds mentions and wikilinks', () => {
    const refs = extractRefs('hola @ana.p, correo x@y.com @123 y @Bob. ver [[Glosario]] y [[doc|alias]] `[[no]]`');
    expect(refs.users.sort()).toEqual(['ana.p', 'bob']);
    expect(refs.wikilinks.sort()).toEqual(['Glosario', 'doc']);
    expect(refs.requirements).toEqual(['123']);
  });
  it('tokenizes preserving text', () => {
    const tokens = tokenizeRefs('A #1 y [[B|b]] @c.');
    expect(tokens.map((t) => (t.type === 'text' ? t.value : t.raw)).join('')).toBe('A #1 y [[B|b]] @c.');
    expect(tokens.filter((t) => t.type !== 'text')).toHaveLength(3);
  });
  it('extracts attachment ids', () => {
    expect(extractRefs('![x](attachment:0e284673-bca0-4cdb-b279-47ddd812c6b4)').attachments).toHaveLength(1);
  });
  it('detects autocomplete triggers', () => {
    expect(detectTrigger('ver #1', 6)).toMatchObject({ kind: 'hash', query: '1', start: 4 });
    expect(detectTrigger('hola @an', 8)).toMatchObject({ kind: 'at', query: 'an' });
    expect(detectTrigger('ver [[Glos', 10)).toMatchObject({ kind: 'wiki', query: 'Glos' });
    expect(detectTrigger('mail a@b', 8)).toBeNull();
  });
});

describe('diffLines', () => {
  it('marks added and removed lines', () => {
    const d = diffLines('a\nb\nc', 'a\nc\nd');
    expect(d.map((l) => l.type)).toEqual(['same', 'del', 'same', 'add']);
  });
});

describe('board neighbours', () => {
  it('moving a card down one position', () => {
    const final = arrayMove(['a', 'b', 'c'], 0, 1); // b a c
    expect(neighbours(final, 'a')).toEqual({ before_id: 'b', after_id: 'c' });
  });
  it('top and bottom', () => {
    expect(neighbours(['x', 'y'], 'x')).toEqual({ before_id: undefined, after_id: 'y' });
    expect(neighbours(['x', 'y'], 'y')).toEqual({ before_id: 'x', after_id: undefined });
  });
});

describe('dates', () => {
  it('parses date-only values as local dates', () => {
    const d = parseDateOnly('2026-09-13');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 13]);
    expect(daysUntil(todayISO())).toBe(0);
  });
});
