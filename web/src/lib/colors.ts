import type { CSSProperties } from 'react';

/** Soft badge colours from a catalog hex colour, readable in both themes. */
export function badgeStyle(color: string | null | undefined): CSSProperties {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#64748b';
  return {
    color: `color-mix(in srgb, ${c} 78%, var(--text-primary))`,
    backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
  };
}

export const LABEL_COLORS: Record<string, string> = {
  gray: '#6b7280', red: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308', lime: '#84cc16',
  green: '#10b981', teal: '#14b8a6', cyan: '#06b6d4', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  purple: '#a855f7', pink: '#ec4899', brown: '#92400e',
};

export function labelStyle(color: string): CSSProperties {
  const c = LABEL_COLORS[color] ?? LABEL_COLORS.blue;
  return { backgroundColor: c, color: ['yellow', 'lime', 'amber', 'cyan'].includes(color) ? '#111827' : '#ffffff' };
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? '')).toUpperCase();
}

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 45%)`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
