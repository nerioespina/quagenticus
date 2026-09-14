import { Bot } from 'lucide-react';
import { avatarColor, initials } from '../../lib/colors';

interface AvatarProps {
  name: string | null | undefined;
  url?: string | null;
  size?: number;
  agent?: boolean;
  className?: string;
  title?: string;
}

export function Avatar({ name, url, size = 24, agent, className = '', title }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.max(9, size * 0.4) };
  if (url) {
    return <img src={url} alt={name ?? ''} title={title ?? name ?? ''} style={style} className={`rounded-full object-cover shrink-0 ${className}`} />;
  }
  return (
    <span
      title={title ?? name ?? ''}
      style={{ ...style, background: agent ? '#7c3aed' : avatarColor(name ?? '?') }}
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 select-none ${className}`}
    >
      {agent ? <Bot style={{ width: size * 0.6, height: size * 0.6 }} /> : initials(name)}
    </span>
  );
}

interface StackMember {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  type?: string;
  is_lead?: boolean;
}

export function AvatarStack({ members, max = 3, size = 22 }: { members: StackMember[]; max?: number; size?: number }) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((m) => (
        <Avatar
          key={m.id}
          name={m.display_name}
          url={m.avatar_url}
          size={size}
          agent={m.type === 'agent'}
          title={`${m.display_name}${m.is_lead ? ' (responsable)' : ''}`}
          className={`ring-2 ring-[var(--bg-surface)] ${m.is_lead ? 'outline outline-1 outline-amber-400' : ''}`}
        />
      ))}
      {rest > 0 && (
        <span
          style={{ width: size, height: size, fontSize: size * 0.4 }}
          className="inline-flex items-center justify-center rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-muted)] ring-2 ring-[var(--bg-surface)] font-semibold"
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
