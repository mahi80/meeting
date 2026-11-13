import type { ReactNode } from 'react';
import {
  Link2,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PenTool,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import type { Panel } from '../../lib/roomTypes';
import { cn } from '../../lib/utils';

type Props = {
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  whiteboardActive: boolean;
  panel: Panel | null;
  unread: number;
  waitingCount: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleShare: () => void;
  onToggleWhiteboard: () => void;
  onOpenPanel: (panel: Panel) => void;
  onInvite: () => void;
  onLeave: () => void;
};

function Control({
  icon,
  label,
  onClick,
  active,
  danger,
  badge,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group flex w-12 shrink-0 flex-col items-center gap-1 sm:w-16"
    >
      <span
        className={cn(
          'relative grid h-11 w-11 place-items-center rounded-full border transition',
          danger
            ? 'border-danger/30 bg-danger/15 text-red-300 hover:bg-danger/25'
            : active
              ? 'border-zoom/40 bg-zoom/20 text-zoom hover:bg-zoom/30'
              : 'border-white/10 bg-white/[0.06] text-mist-200 hover:bg-white/[0.12]',
        )}
      >
        {icon}
        {Boolean(badge) && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-zoom px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        )}
      </span>
      <span className="hidden text-[10px] leading-none text-mist-500 transition group-hover:text-mist-300 sm:block">
        {label}
      </span>
    </button>
  );
}

export function Toolbar({
  micOn,
  camOn,
  sharing,
  whiteboardActive,
  panel,
  unread,
  waitingCount,
  onToggleMic,
  onToggleCam,
  onToggleShare,
  onToggleWhiteboard,
  onOpenPanel,
  onInvite,
  onLeave,
}: Props) {
  return (
    <div className="scrollbar-slim flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-ink-800 bg-ink-900/95 px-2 py-2 backdrop-blur sm:justify-center sm:gap-1">
      <Control
        icon={micOn ? <Mic size={18} /> : <MicOff size={18} />}
        label={micOn ? 'Mute' : 'Unmute'}
        danger={!micOn}
        onClick={onToggleMic}
      />
      <Control
        icon={camOn ? <Video size={18} /> : <VideoOff size={18} />}
        label={camOn ? 'Stop video' : 'Start video'}
        danger={!camOn}
        onClick={onToggleCam}
      />

      <span className="mx-1 hidden h-8 w-px bg-ink-700 sm:block" />

      <Control
        icon={<MonitorUp size={18} />}
        label={sharing ? 'Stop share' : 'Share'}
        active={sharing}
        onClick={onToggleShare}
      />
      <Control
        icon={<PenTool size={18} />}
        label={whiteboardActive ? 'Stop whiteboard' : 'Whiteboard'}
        active={whiteboardActive}
        onClick={onToggleWhiteboard}
      />
      <Control
        icon={<MessageSquare size={18} />}
        label="Chat"
        active={panel === 'chat'}
        badge={unread}
        onClick={() => onOpenPanel('chat')}
      />
      <Control
        icon={<Users size={18} />}
        label="People"
        active={panel === 'people'}
        badge={waitingCount}
        onClick={() => onOpenPanel('people')}
      />
      <Control icon={<Link2 size={18} />} label="Invite" onClick={onInvite} />

      <span className="mx-1 hidden h-8 w-px bg-ink-700 sm:block" />

      <button
        type="button"
        onClick={onLeave}
        title="Leave meeting"
        aria-label="Leave meeting"
        className="group flex w-12 shrink-0 flex-col items-center gap-1 sm:w-16"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-danger text-white transition hover:bg-red-600">
          <PhoneOff size={18} />
        </span>
        <span className="hidden text-[10px] leading-none text-mist-500 transition group-hover:text-mist-300 sm:block">
          Leave
        </span>
      </button>
    </div>
  );
}