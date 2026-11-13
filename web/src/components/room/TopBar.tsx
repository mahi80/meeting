import type { ReactNode } from 'react';
import { Copy, LayoutGrid, MessageSquare, Presentation, ShieldCheck, UserRound, Users, Video } from 'lucide-react';
import type { Panel, ViewMode } from '../../lib/roomTypes';
import { copyText } from '../../lib/utils';

type Props = {
  title: string;
  meetingId: string;
  isHost: boolean;
  participantCount: number;
  waitingCount: number;
  panel: Panel | null;
  unread: number;
  mode: ViewMode;
  onToggleMode: () => void;
  onOpenPanel: (panel: Panel) => void;
  onInvite: () => void;
  showToast: (message: string) => void;
};

function IconButton({
  children,
  label,
  onClick,
  active,
  badge,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative grid h-8 w-8 place-items-center rounded-lg transition ${
        active ? 'bg-zoom/20 text-zoom' : 'text-mist-300 hover:bg-ink-800 hover:text-mist-100'
      }`}
    >
      {children}
      {Boolean(badge) && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-zoom px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

export function TopBar({
  title,
  meetingId,
  isHost,
  participantCount,
  waitingCount,
  panel,
  unread,
  mode,
  onToggleMode,
  onOpenPanel,
  onInvite,
  showToast,
}: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900/85 px-3 backdrop-blur sm:gap-3 sm:px-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zoom text-white shadow-md shadow-zoom/20">
        <Video size={15} />
      </span>

      <div className="min-w-0">
        <h1 className="flex items-center gap-1.5 truncate text-[13px] font-semibold leading-tight">
          {title}
          {isHost && (
            <span className="hidden items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 sm:flex">
              <ShieldCheck size={9} /> HOST
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={() => {
            void copyText(meetingId).then((ok) => showToast(ok ? 'Meeting ID copied' : 'Copy failed'));
          }}
          className="mt-0.5 flex items-center gap-1 text-[10px] text-mist-500 transition hover:text-mist-300"
          title="Copy meeting ID"
        >
          <span className="max-w-[110px] truncate sm:max-w-none">ID: {meetingId}</span>
          <Copy size={9} />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-1 hidden items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-[11px] text-mist-300 sm:flex">
          <Users size={12} /> {participantCount}
        </span>

        <IconButton label={mode === 'gallery' ? 'Switch to speaker view' : 'Switch to gallery view'} onClick={onToggleMode}>
          {mode === 'gallery' ? <Presentation size={15} /> : <LayoutGrid size={15} />}
        </IconButton>

        <button
          type="button"
          onClick={onInvite}
          className="hidden items-center gap-1.5 rounded-lg bg-zoom px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-zoom-dark sm:flex"
        >
          <UserRound size={13} /> Invite
        </button>

        <IconButton
          label="Meeting chat"
          active={panel === 'chat'}
          badge={unread}
          onClick={() => onOpenPanel('chat')}
        >
          <MessageSquare size={15} />
        </IconButton>

        <IconButton
          label="Participants and waiting room"
          active={panel === 'people'}
          badge={waitingCount}
          onClick={() => onOpenPanel('people')}
        >
          <Users size={15} />
        </IconButton>
      </div>
    </header>
  );
}