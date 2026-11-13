import { useEffect, useRef, useState } from 'react';
import { DoorOpen, Loader2, Lock, RefreshCw, ShieldCheck, UserX, Video, WifiOff } from 'lucide-react';
import { ApiError, getJoinStatus } from '../lib/api';

type Props = {
  requestId: string;
  title: string;
  name: string;
  onApproved: (session: { token: string; serverUrl: string }) => void;
  onRetry: () => void;
  onCancel: () => void;
};

type WaitingState = 'pending' | 'denied' | 'expired' | 'offline';

export function WaitingRoom({ requestId, title, name, onApproved, onRetry, onCancel }: Props) {
  const [state, setState] = useState<WaitingState>('pending');
  const approvedRef = useRef(onApproved);
  approvedRef.current = onApproved;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const status = await getJoinStatus(requestId);
        if (cancelled) return;
        if (status.status === 'approved' && status.token) {
          approvedRef.current({ token: status.token, serverUrl: status.serverUrl });
        } else if (status.status === 'denied') {
          setState('denied');
        } else if (status.status === 'expired') {
          setState('expired');
        } else {
          setState((current) => (current === 'offline' ? 'pending' : current));
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setState('expired');
        } else {
          setState((current) => (current === 'pending' ? 'offline' : current));
        }
      }
    }

    void poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [requestId]);

  return (
    <div className="flex min-h-full flex-col bg-room">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-mist-400">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-zoom text-white">
            <Video size={14} />
          </span>
          <span className="max-w-[260px] truncate font-medium text-mist-200">{title}</span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
        >
          Leave
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900/80 p-8 text-center shadow-2xl shadow-black/30 animate-rise">
          {state === 'pending' && (
            <>
              <div className="relative mx-auto grid h-24 w-24 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-zoom/10" />
                <span className="absolute inset-2 rounded-full border border-zoom/20" />
                <span className="relative grid h-16 w-16 place-items-center rounded-full bg-zoom/15 text-2xl font-semibold text-zoom">
                  {name.trim().charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <h1 className="mt-6 text-lg font-semibold">Waiting for the host</h1>
              <p className="mt-2 text-sm text-mist-400">
                The host has been notified that <span className="font-medium text-mist-200">{name}</span> wants to join.
              </p>
              <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-mist-500">
                <Loader2 size={14} className="animate-spin" />
                Please wait — you will join automatically
              </div>
              <div className="mt-7 flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-950/50 p-3 text-left text-[11px] leading-relaxed text-mist-400">
                <Lock size={14} className="mt-0.5 shrink-0 text-zoom" />
                Your camera and microphone stay off until the host admits you.
              </div>
            </>
          )}

          {state === 'denied' && (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger/15 text-danger">
                <UserX size={28} />
              </span>
              <h1 className="mt-5 text-lg font-semibold">The host didn't admit you</h1>
              <p className="mt-2 text-sm text-mist-400">
                Your request was declined. You can ask to join again in case it was a mistake.
              </p>
              <div className="mt-6 space-y-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full rounded-lg bg-zoom px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zoom-dark"
                >
                  Ask to join again
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
                >
                  Back to home
                </button>
              </div>
            </>
          )}

          {state === 'expired' && (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-400/15 text-amber-300">
                <RefreshCw size={26} />
              </span>
              <h1 className="mt-5 text-lg font-semibold">Join request expired</h1>
              <p className="mt-2 text-sm text-mist-400">
                The host didn't respond in time. Ask to join again when you're ready.
              </p>
              <div className="mt-6 space-y-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full rounded-lg bg-zoom px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zoom-dark"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
                >
                  Back to home
                </button>
              </div>
            </>
          )}

          {state === 'offline' && (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ink-700 text-mist-300">
                <WifiOff size={26} />
              </span>
              <h1 className="mt-5 text-lg font-semibold">Can't reach the server</h1>
              <p className="mt-2 text-sm text-mist-400">
                We'll keep retrying every few seconds. Check your connection if this continues.
              </p>
              <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-mist-500">
                <Loader2 size={14} className="animate-spin" /> Reconnecting…
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="mt-6 w-full rounded-lg px-4 py-2.5 text-sm text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
              >
                Leave
              </button>
            </>
          )}

          {state === 'pending' && (
            <div className="mt-7 border-t border-ink-700/70 pt-4 text-[11px] text-mist-500">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={12} /> Host-controlled waiting room
              </span>
              <span className="mx-2">·</span>
              <span className="inline-flex items-center gap-1.5">
                <DoorOpen size={12} /> Meeting ID {requestId.slice(0, 6)}…
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}