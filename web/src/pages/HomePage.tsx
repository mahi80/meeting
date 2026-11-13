import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Lock,
  MessagesSquare,
  MonitorUp,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
  Wifi,
} from 'lucide-react';
import { createMeeting } from '../lib/api';
import { parseMeetingInput, randomPasscode } from '../lib/utils';
import { savePasscode } from '../lib/session';

const inputClass =
  'w-full rounded-lg border border-ink-600 bg-ink-950/60 px-3.5 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 transition focus:border-zoom/70 focus:ring-2 focus:ring-zoom/20';

const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-mist-400';

const features = [
  { icon: Video, title: 'HD video & audio', text: 'Built on LiveKit WebRTC with simulcast and adaptive streaming.' },
  { icon: MonitorUp, title: 'Screen sharing', text: 'Crisp text and a Zoom-style filmstrip, not a Meet overlay.' },
  { icon: ShieldCheck, title: 'Passcode + waiting room', text: 'Guests wait until the host admits them.' },
  { icon: MessagesSquare, title: 'In-meeting chat', text: 'Message everyone without leaving the call.' },
];

export function HomePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [passcode, setPasscode] = useState(randomPasscode);
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  async function startMeeting() {
    setError('');
    setBusy('create');
    try {
      const created = await createMeeting({ title, passcode });
      savePasscode(created.meetingId, passcode);
      navigate(
        `/m/${created.meetingId}?host=${encodeURIComponent(created.hostKey)}&created=1#p=${encodeURIComponent(passcode)}`,
      );
    } catch {
      setError('Could not create the meeting. Is the server running?');
      setBusy(null);
    }
  }

  function joinMeeting() {
    setError('');
    const id = parseMeetingInput(joinInput);
    if (!id) {
      setError('Paste a valid meeting link or meeting ID.');
      return;
    }
    let fragment = '';
    const match = joinInput.match(/[#&?]p=([^&\s]+)/);
    if (match?.[1]) fragment = `#p=${encodeURIComponent(decodeURIComponent(match[1]))}`;
    setBusy('join');
    navigate(`/m/${id}${fragment}`);
  }

  return (
    <div className="min-h-full bg-room">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-zoom text-white shadow-lg shadow-zoom/25">
            <Video size={20} />
          </span>
          <div>
            <p className="text-lg font-semibold leading-none">Meet</p>
            <p className="mt-1 text-[11px] text-mist-500">Video meetings</p>
          </div>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1.5 text-[11px] text-mist-400 sm:flex">
          <Wifi size={12} className="text-ok" /> WebRTC · LiveKit
        </span>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-6 lg:grid-cols-[1.02fr_1fr] lg:items-center lg:gap-14">
        <section className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-zoom/25 bg-zoom/10 px-3 py-1 text-[11px] font-medium text-zoom">
            <Sparkles size={12} /> Zoom-style meetings in the browser
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Meetings that
            <br />
            feel like <span className="text-zoom">Zoom.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-mist-400">
            Start a call, share a link on WhatsApp, and meet with video, screen sharing and chat.
            A host-controlled waiting room keeps strangers out.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map(({ icon: Icon, title: featureTitle, text }) => (
              <div key={featureTitle} className="flex items-start gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-800 text-zoom">
                  <Icon size={15} />
                </span>
                <div>
                  <p className="text-[13px] font-medium">{featureTitle}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-mist-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 animate-rise">
          <div className="rounded-2xl border border-ink-700 bg-ink-900/80 p-6 shadow-2xl shadow-black/30 backdrop-blur">
            <h2 className="text-base font-semibold">Start a meeting</h2>
            <p className="mt-1 text-xs text-mist-500">You will join as the host and admit guests from the waiting room.</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className={labelClass} htmlFor="meeting-title">
                  Meeting title
                </label>
                <input
                  id="meeting-title"
                  className={inputClass}
                  placeholder="Team standup"
                  maxLength={80}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="meeting-passcode">
                  Passcode
                </label>
                <div className="relative">
                  <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500" />
                  <input
                    id="meeting-passcode"
                    className={`${inputClass} pl-9 pr-11`}
                    value={passcode}
                    maxLength={32}
                    onChange={(event) => setPasscode(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setPasscode(randomPasscode())}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
                    title="Generate a new passcode"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={startMeeting}
                disabled={busy !== null || passcode.trim().length < 4}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-zoom px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zoom-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'create' ? 'Creating…' : 'Start meeting'}
                {busy !== 'create' && <ArrowRight size={16} />}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6 backdrop-blur">
            <h2 className="text-base font-semibold">Join a meeting</h2>
            <p className="mt-1 text-xs text-mist-500">Paste the invite link or the meeting ID.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className={inputClass}
                placeholder="https://…/m/AbC123 or AbC123"
                value={joinInput}
                onChange={(event) => setJoinInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') joinMeeting();
                }}
              />
              <button
                type="button"
                onClick={joinMeeting}
                disabled={busy !== null}
                className="shrink-0 rounded-lg border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm font-semibold text-mist-100 transition hover:border-zoom/50 hover:bg-ink-700 disabled:opacity-50"
              >
                {busy === 'join' ? 'Joining…' : 'Join'}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-xs text-red-300">{error}</p>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-ink-800/80 px-6 py-5 text-[11px] text-mist-500">
        Web + Android clients · LiveKit Cloud or self-hosted SFU · Passcode and waiting room
      </footer>
    </div>
  );
}