import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Check,
  Crown,
  Download,
  FileText,
  Link2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Paperclip,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import type { Participant } from 'livekit-client';
import type { ChatMessage } from '../../hooks/useChat';
import type { WaitingRequest } from '../../lib/api';
import {
  avatarClass,
  isCameraEnabled,
  isHostParticipant,
  isMicEnabled,
  participantName,
} from '../../lib/participants';
import type { Panel } from '../../lib/roomTypes';
import { cn, copyText, formatBytes, formatTime, initials } from '../../lib/utils';

type SidePanelProps = {
  panel: Panel;
  unread: number;
  waitingCount: number;
  isHost: boolean;
  participants: Participant[];
  waiting: WaitingRequest[];
  waitingOffline: boolean;
  messages: ChatMessage[];
  inviteUrl: string;
  passcode: string;
  onTab: (panel: Panel) => void;
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
  onSendFile: (file: File, caption: string, onProgress: (fraction: number) => void) => Promise<void>;
  onDecide: (requestId: string, action: 'approve' | 'deny') => void;
  onInvite: () => void;
  showToast: (message: string) => void;
};

function Tab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 px-3 text-xs font-medium transition',
        active ? 'text-mist-100' : 'text-mist-500 hover:text-mist-300',
      )}
    >
      {icon}
      {label}
      {Boolean(badge) && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-zoom px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-zoom" />}
    </button>
  );
}

function Avatar({ name, size = 'normal' }: { name: string; size?: 'normal' | 'small' }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold',
        avatarClass(name),
        size === 'small' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs',
      )}
    >
      {initials(name)}
    </span>
  );
}

function ChatPanel({
  messages,
  onSend,
  onSendFile,
  showToast,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<void>;
  onSendFile: (file: File, caption: string, onProgress: (fraction: number) => void) => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function submit() {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      await onSend(clean);
      setText('');
    } finally {
      setSending(false);
    }
  }

  async function submitFile(file: File) {
    if (upload) return;
    setUpload({ name: file.name, percent: 0 });
    try {
      await onSendFile(file, text.trim(), (fraction) =>
        setUpload({ name: file.name, percent: Math.round(fraction * 100) }),
      );
      setText('');
    } catch {
      showToast('Could not upload the file');
    } finally {
      setUpload(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-800 text-mist-400">
              <MessageSquare size={20} />
            </span>
            <p className="mt-3 text-sm font-medium text-mist-300">No messages yet</p>
            <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-mist-500">
              Messages and files are visible to everyone in the meeting and are not saved after you leave.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="flex items-start gap-2.5">
                <Avatar name={message.name} size="small" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn('truncate text-[11px] font-semibold', message.local ? 'text-zoom' : 'text-mist-200')}>
                      {message.local ? 'You' : message.name}
                    </span>
                    <span className="shrink-0 text-[9px] text-mist-500">{formatTime(message.ts)}</span>
                  </div>
                  {message.text && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-mist-200">
                      {message.text}
                    </p>
                  )}
                  {message.file && (
                    <a
                      href={message.file.url}
                      download={message.file.name}
                      className="mt-1.5 flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-950/60 px-2.5 py-2 transition hover:border-zoom/50 hover:bg-ink-850"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zoom/15 text-zoom">
                        <FileText size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-mist-100">
                          {message.file.name}
                        </span>
                        <span className="block text-[10px] text-mist-500">
                          {formatBytes(message.file.size)}
                        </span>
                      </span>
                      <Download size={14} className="shrink-0 text-mist-400" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {upload && (
        <div className="shrink-0 px-3 pt-2">
          <div className="flex items-center gap-1.5 text-[10px] text-mist-400">
            <Paperclip size={11} />
            <span className="truncate">{upload.name}</span>
            <span className="ml-auto tabular-nums">{upload.percent}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-700">
            <div
              className="h-full rounded-full bg-zoom transition-[width]"
              style={{ width: `${upload.percent}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-ink-700 p-3">
        <div className="flex items-end gap-2 rounded-lg border border-ink-600 bg-ink-950/60 p-1.5 transition focus-within:border-zoom/60">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void submitFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={Boolean(upload)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-mist-400 transition hover:bg-white/10 hover:text-mist-100 disabled:opacity-40"
            title="Send a file"
            aria-label="Send a file"
          >
            <Paperclip size={15} />
          </button>
          <textarea
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Message everyone"
            className="max-h-24 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-mist-100 placeholder:text-mist-500"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zoom text-white transition hover:bg-zoom-dark disabled:opacity-40"
            title="Send message"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

function PeoplePanel({
  participants,
  waiting,
  waitingOffline,
  isHost,
  inviteUrl,
  onDecide,
  onInvite,
  showToast,
}: {
  participants: Participant[];
  waiting: WaitingRequest[];
  waitingOffline: boolean;
  isHost: boolean;
  inviteUrl: string;
  onDecide: (requestId: string, action: 'approve' | 'deny') => void;
  onInvite: () => void;
  showToast: (message: string) => void;
}) {
  return (
    <div className="scrollbar-slim flex-1 overflow-y-auto px-3 py-3">
      {isHost && (
        <section>
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-500">
              Waiting to join
            </span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', waiting.length ? 'bg-zoom/20 text-zoom' : 'text-mist-500')}>
              {waiting.length}
            </span>
          </div>

          {waitingOffline && (
            <p className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2 text-[10px] text-amber-300">
              Waiting room is offline. Retrying…
            </p>
          )}

          {waiting.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-700 px-3 py-4 text-center text-[11px] text-mist-500">
              No one is waiting. Share the invite link to bring people in.
            </p>
          ) : (
            <div className="space-y-2">
              {waiting.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-950/50 p-2.5"
                >
                  <Avatar name={request.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{request.name}</p>
                    <p className="text-[10px] text-mist-500">Wants to join</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDecide(request.id, 'approve')}
                    className="flex items-center gap-1 rounded-md bg-zoom px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-zoom-dark"
                  >
                    <Check size={11} /> Admit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecide(request.id, 'deny')}
                    className="rounded-md px-1.5 py-1 text-[10px] text-mist-400 transition hover:bg-danger/10 hover:text-red-300"
                  >
                    Deny
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mt-5">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-500">
            In the meeting
          </span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-mist-400">{participants.length}</span>
        </div>
        <div className="space-y-1">
          {participants.map((participant) => {
            const name = participantName(participant);
            const host = isHostParticipant(participant);
            return (
              <div
                key={participant.identity}
                className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition hover:bg-ink-850"
              >
                <Avatar name={name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-xs font-medium">
                    {name}
                    {participant.isLocal && <span className="text-[10px] font-normal text-mist-500">(You)</span>}
                    {host && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-400/15 px-1 text-[8px] font-bold text-amber-300">
                        <Crown size={8} /> HOST
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-mist-500">{host ? 'Meeting host' : 'Guest'}</p>
                </div>
                <span className={cn('text-mist-500', !isMicEnabled(participant) && 'text-danger')}>
                  {isMicEnabled(participant) ? <Mic size={13} /> : <MicOff size={13} />}
                </span>
                <span className={cn('text-mist-500', !isCameraEnabled(participant) && 'text-danger')}>
                  {isCameraEnabled(participant) ? <Video size={13} /> : <VideoOff size={13} />}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-ink-700 bg-ink-950/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-mist-500">Invite people</p>
        <p className="mt-1 truncate text-[11px] text-mist-400">{inviteUrl}</p>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              void copyText(inviteUrl).then((ok) => showToast(ok ? 'Invite link copied' : 'Copy failed'));
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-2 py-1.5 text-[10px] font-medium text-mist-200 transition hover:bg-ink-700"
          >
            <Link2 size={11} /> Copy link
          </button>
          <button
            type="button"
            onClick={onInvite}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-zoom px-2 py-1.5 text-[10px] font-semibold text-white transition hover:bg-zoom-dark"
          >
            <MessageSquare size={11} /> Invite
          </button>
        </div>
      </section>

      <p className="mt-4 flex items-center justify-center gap-1.5 px-2 text-[10px] text-mist-600">
        <Lock size={10} /> Passcode protected · waiting room enabled
      </p>
    </div>
  );
}

export function SidePanel({
  panel,
  unread,
  waitingCount,
  isHost,
  participants,
  waiting,
  waitingOffline,
  messages,
  inviteUrl,
  onTab,
  onClose,
  onSend,
  onSendFile,
  onDecide,
  onInvite,
  showToast,
}: SidePanelProps) {
  return (
    <aside className="flex h-full w-full flex-col border-ink-700 bg-ink-900 sm:border-l">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-ink-700 pr-2">
        <div className="flex h-full items-stretch">
          <Tab
            active={panel === 'chat'}
            onClick={() => onTab('chat')}
            icon={<MessageSquare size={13} />}
            label="Chat"
            badge={unread}
          />
          <Tab
            active={panel === 'people'}
            onClick={() => onTab('people')}
            icon={<Users size={13} />}
            label="People"
            badge={waitingCount}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-md text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
          title="Close panel"
        >
          <X size={15} />
        </button>
      </div>

      {panel === 'chat' ? (
        <ChatPanel
          messages={messages}
          onSend={onSend}
          onSendFile={onSendFile}
          showToast={showToast}
        />
      ) : (
        <PeoplePanel
          participants={participants}
          waiting={waiting}
          waitingOffline={waitingOffline}
          isHost={isHost}
          inviteUrl={inviteUrl}
          onDecide={onDecide}
          onInvite={onInvite}
          showToast={showToast}
        />
      )}

      {panel === 'people' && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-ink-700 py-2 text-[9px] text-mist-600">
          <ShieldCheck size={10} /> Host controls the waiting room
          <UserRound size={10} />
        </div>
      )}
    </aside>
  );
}