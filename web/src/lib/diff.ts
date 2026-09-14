export type DiffLine = { type: 'same' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number };

/** Line-based diff (LCS). Good enough for document versions of a few thousand lines. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    return [...a.map((text, i) => ({ type: 'del' as const, text, oldNo: i + 1 })), ...b.map((text, i) => ({ type: 'add' as const, text, newNo: i + 1 }))];
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i], oldNo: i + 1 });
      i++;
    } else {
      out.push({ type: 'add', text: b[j], newNo: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i], oldNo: ++i });
  while (j < m) out.push({ type: 'add', text: b[j], newNo: ++j });
  return out;
}
