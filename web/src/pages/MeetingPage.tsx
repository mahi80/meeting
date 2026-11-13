import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, PhoneOff, TriangleAlert, Video } from 'lucide-react';
import { ApiError, getHostSession, getMeeting, requestJoin, type MeetingInfo } from '../lib/api';
import {
  clearRequestId,
  loadHostKey,
  loadName,
  loadPasscode,
  loadRequestId,
  passcodeFromHash,
  saveHostKey,
  saveName,
  savePasscode,
  saveRequestId,
} from '../lib/session';
import { PreJoin } from '../components/PreJoin';
import { WaitingRoom } from '../components/WaitingRoom';
import { MeetingRoom } from '../components/MeetingRoom';
import type { Session } from '../lib/roomTypes';

type Phase = 'loading' | 'prejoin' | 'waiting' | 'meeting' | 'ended' | 'error';

export function MeetingPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [hostKey, setHostKey] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const leftRef = useRef(false);

  const queryHost = searchParams.get('host') ?? '';
  const created = searchParams.get('created') === '1';
  const isHost = Boolean(hostKey);
  const passcode = passcodeFromHash() || loadPasscode(id);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) {
        setLoadError('This meeting link is not valid.');
        setPhase('error');
        return;
      }

      try {
        const info = await getMeeting(id);
        if (cancelled) return;
        setMeeting(info);

        const storedHostKey = loadHostKey(id);
        const effectiveHostKey = queryHost || storedHostKey;
        if (queryHost) saveHostKey(id, queryHost);
        if (effectiveHostKey) setHostKey(effectiveHostKey);

        const hashPasscode = passcodeFromHash();
        if (hashPasscode) savePasscode(id, hashPasscode);

        if (!effectiveHostKey) {
          const existingRequest = loadRequestId(id);
          if (existingRequest) {
            setRequestId(existingRequest);
            setPhase('waiting');
            return;
          }
        }

        setPhase('prejoin');
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? 'Meeting not found. Check the invite link and try again.'
            : 'Could not reach the meeting server. Try again in a moment.',
        );
        setPhase('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, queryHost]);

  const handleJoin = useCallback(
    async (options: { name: string; micOn: boolean; camOn: boolean; passcode: string }) => {
      const { name, micOn, camOn, passcode: enteredPasscode } = options;
      saveName(name);
      savePasscode(id, enteredPasscode);
      setBusy(true);
      setError('');

      try {
        if (hostKey) {
          const hostSession = await getHostSession(id, hostKey, name);
          setSession({ token: hostSession.token, serverUrl: hostSession.serverUrl, micOn, camOn });
          leftRef.current = false;
          setPhase('meeting');
        } else {
          const result = await requestJoin(id, name, enteredPasscode);
          saveRequestId(id, result.requestId);
          setRequestId(result.requestId);
          setPhase('waiting');
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === 'wrong_passcode') {
            setError('Incorrect passcode. Check the invite and try again.');
          } else if (err.status === 401) {
            setError('This host link is not valid. Use the guest link instead.');
          } else if (err.status === 429) {
            setError('Too many attempts. Wait a minute and try again.');
          } else {
            setError(err.message);
          }
        } else {
          setError('Could not reach the server. Check your connection and try again.');
        }
      } finally {
        setBusy(false);
      }
    },
    [hostKey, id],
  );

  const handleApproved = useCallback((approved: { token: string; serverUrl: string }) => {
    leftRef.current = false;
    setSession({ token: approved.token, serverUrl: approved.serverUrl, micOn: true, camOn: true });
    setPhase('meeting');
  }, []);

  const handleRetryJoin = useCallback(() => {
    clearRequestId(id);
    setRequestId('');
    setError('');
    setPhase('prejoin');
  }, [id]);

  const handleCancelWaiting = useCallback(() => {
    clearRequestId(id);
    setRequestId('');
    navigate('/');
  }, [id, navigate]);

  const handleLeave = useCallback(() => {
    leftRef.current = true;
    if (!hostKey) clearRequestId(id);
    setSession(null);
    setPhase('ended');
  }, [hostKey, id]);

  const handleDisconnected = useCallback(() => {
    if (leftRef.current) return;
    setSession(null);
    setPhase('ended');
  }, []);

  if (phase === 'loading') {
    return (
      <div className="grid min-h-full place-items-center bg-room text-mist-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-zoom" />
          <p className="text-xs">Loading meeting…</p>
        </div>
      </div>
    );
  }

  if (phase === 'error' || !meeting) {
    return (
      <div className="grid min-h-full place-items-center bg-room px-4">
        <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900/80 p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger/15 text-danger">
            <TriangleAlert size={24} />
          </span>
          <h1 className="mt-5 text-lg font-semibold">Meeting unavailable</h1>
          <p className="mt-2 text-sm text-mist-400">{loadError || 'This meeting does not exist.'}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-zoom px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zoom-dark"
          >
            <ArrowLeft size={15} /> Back to home
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'meeting' && session) {
    return (
      <MeetingRoom
        meeting={meeting}
        session={session}
        isHost={isHost}
        hostKey={hostKey}
        passcode={passcode}
        created={created}
        onLeave={handleLeave}
        onDisconnected={handleDisconnected}
      />
    );
  }

  if (phase === 'waiting' && requestId) {
    return (
      <WaitingRoom
        requestId={requestId}
        title={meeting.title}
        name={loadName()}
        onApproved={handleApproved}
        onRetry={handleRetryJoin}
        onCancel={handleCancelWaiting}
      />
    );
  }

  if (phase === 'prejoin') {
    return (
      <PreJoin
        title={meeting.title}
        isHost={isHost}
        defaultName={loadName()}
        defaultPasscode={passcode}
        busy={busy}
        error={error || null}
        onJoin={(options) => void handleJoin(options)}
        onBack={() => navigate('/')}
      />
    );
  }

  return (
    <div className="grid min-h-full place-items-center bg-room px-4">
      <div className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900/80 p-8 text-center animate-rise">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink-800 text-mist-300">
          <PhoneOff size={22} />
        </span>
        <h1 className="mt-5 text-lg font-semibold">You left the meeting</h1>
        <p className="mt-2 text-sm text-mist-400">{meeting.title}</p>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => setPhase('prejoin')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zoom px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zoom-dark"
          >
            <Video size={15} /> Rejoin
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full rounded-lg px-4 py-2.5 text-sm text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}