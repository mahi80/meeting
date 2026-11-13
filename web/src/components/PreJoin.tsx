import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Crown,
  Lock,
  Mic,
  MicOff,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { cn, initials } from '../lib/utils';

type JoinOptions = {
  name: string;
  micOn: boolean;
  camOn: boolean;
  passcode: string;
};

type Props = {
  title: string;
  isHost: boolean;
  defaultName: string;
  defaultPasscode: string;
  busy: boolean;
  error: string | null;
  onJoin: (options: JoinOptions) => void;
  onBack: () => void;
};

const inputClass =
  'w-full rounded-lg border border-ink-600 bg-ink-950/60 px-3.5 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 transition focus:border-zoom/70 focus:ring-2 focus:ring-zoom/20';

const stopTracks = (stream: MediaStream | null) =>
  stream?.getTracks().forEach((track) => track.stop());

function cameraErrorMessage(err: DOMException) {
  switch (err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow the camera in the address bar (lock icon), then press the camera button again.';
    case 'NotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is in use by another app. Close it and press the camera button again.';
    case 'OverconstrainedError':
      return 'The camera does not support the requested settings.';
    default:
      return 'The camera could not be started.';
  }
}

function micErrorMessage(err: DOMException) {
  switch (err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access is blocked. Allow the microphone in the address bar (lock icon), then press the mic button again.';
    case 'NotFoundError':
      return 'No microphone was found on this device.';
    case 'NotReadableError':
      return 'The microphone is in use by another app.';
    default:
      return 'The microphone could not be started.';
  }
}

function usePreview(micOn: boolean, camOn: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const [camError, setCamError] = useState('');
  const [micError, setMicError] = useState('');

  // Audio and video are requested separately so a blocked camera does not
  // knock out the microphone (and vice versa).
  useEffect(() => {
    if (!micOn) {
      setAudioStream(null);
      setMicError('');
      return;
    }
    let cancelled = false;
    let active: MediaStream | null = null;
    setMicError('');
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((media) => {
        if (cancelled) {
          stopTracks(media);
          return;
        }
        active = media;
        setAudioStream(media);
      })
      .catch((err: DOMException) => {
        if (cancelled) return;
        setAudioStream(null);
        setMicError(micErrorMessage(err));
      });

    return () => {
      cancelled = true;
      stopTracks(active);
    };
  }, [micOn]);

  useEffect(() => {
    if (!camOn) {
      setVideoStream(null);
      setCamError('');
      return;
    }
    let cancelled = false;
    let active: MediaStream | null = null;
    setCamError('');
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      })
      .then((media) => {
        if (cancelled) {
          stopTracks(media);
          return;
        }
        active = media;
        setVideoStream(media);
      })
      .catch((err: DOMException) => {
        if (cancelled) return;
        setVideoStream(null);
        setCamError(cameraErrorMessage(err));
      });

    return () => {
      cancelled = true;
      stopTracks(active);
    };
  }, [camOn]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = videoStream;
  }, [videoStream]);

  useEffect(() => {
    if (!audioStream || !micOn) {
      setLevel(0);
      return;
    }
    const audioTracks = audioStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const ctx = new AudioCtor();
    const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    const tick = () => {
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (const value of buffer) sum += value;
      setLevel(Math.min(1, sum / buffer.length / 90));
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      void ctx.close();
    };
  }, [audioStream, micOn]);

  return { videoRef, level, camError, micError, hasVideo: Boolean(videoStream) };
}

export function PreJoin({
  title,
  isHost,
  defaultName,
  defaultPasscode,
  busy,
  error: externalError,
  onJoin,
  onBack,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [passcode, setPasscode] = useState(defaultPasscode);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localError, setLocalError] = useState('');
  const { videoRef, level, camError, micError, hasVideo } = usePreview(micOn, camOn);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setLocalError('Enter your name to join.');
      return;
    }
    if (!isHost && passcode.trim().length < 4) {
      setLocalError('Enter the meeting passcode.');
      return;
    }
    setLocalError('');
    onJoin({ name: name.trim(), micOn, camOn, passcode: passcode.trim() });
  }

  const shownError = localError || externalError;

  return (
    <div className="flex min-h-full flex-col bg-room">
      <header className="flex items-center justify-between px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
        >
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2 text-xs text-mist-400">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-zoom text-white">
            <Video size={14} />
          </span>
          <span className="max-w-[240px] truncate font-medium text-mist-200">{title}</span>
        </div>
        <div className="w-14" />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="grid w-full max-w-4xl gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-ink-700 bg-ink-800 shadow-2xl shadow-black/30">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                'h-full w-full -scale-x-100 object-cover',
                (!camOn || !hasVideo) && 'hidden',
              )}
            />

            {(!camOn || !hasVideo) && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_50%_35%,#243043,#11151b_70%)]">
                <span className="grid h-24 w-24 place-items-center rounded-full bg-ink-700 text-3xl font-semibold text-mist-200">
                  {initials(name || 'You')}
                </span>
                <span className="max-w-[22rem] px-4 text-center text-xs leading-relaxed text-mist-400">
                  <CameraOff size={13} className="mr-1.5 inline" />
                  {camError || (camOn ? 'Starting camera…' : 'Camera is off')}
                </span>
              </div>
            )}

            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium text-mist-200 backdrop-blur">
                <span className={cn('h-1.5 w-1.5 rounded-full', hasVideo ? 'bg-ok' : 'bg-mist-500')} />
                {hasVideo ? 'Camera preview' : 'Camera off'}
              </span>
              {isHost && (
                <span className="flex items-center gap-1.5 rounded-md bg-amber-400/15 px-2 py-1 text-[10px] font-semibold text-amber-300 backdrop-blur">
                  <Crown size={11} /> Host
                </span>
              )}
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-12">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMicOn((value) => !value)}
                  className={cn(
                    'grid h-11 w-11 place-items-center rounded-full border transition',
                    micOn
                      ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                      : 'border-danger/40 bg-danger/20 text-red-300 hover:bg-danger/30',
                  )}
                  title={micOn ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                <div className="flex h-6 items-end gap-0.5" title="Microphone level">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <span
                      key={bar}
                      className={cn(
                        'w-1 rounded-full transition-all duration-75',
                        micOn && level * 5 > bar ? 'bg-ok' : 'bg-white/20',
                      )}
                      style={{ height: `${6 + bar * 4}px` }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCamOn((value) => !value)}
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-full border transition',
                  camOn
                    ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                    : 'border-danger/40 bg-danger/20 text-red-300 hover:bg-danger/30',
                )}
                title={camOn ? 'Turn camera off' : 'Turn camera on'}
              >
                {camOn ? <Camera size={18} /> : <CameraOff size={18} />}
              </button>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="flex flex-col rounded-2xl border border-ink-700 bg-ink-900/80 p-6 shadow-2xl shadow-black/20"
          >
            <h1 className="text-xl font-semibold">{isHost ? 'Start as host' : 'Join meeting'}</h1>
            <p className="mt-1.5 text-xs leading-relaxed text-mist-500">
              {isHost
                ? 'You control the waiting room and can admit guests.'
                : 'Your name is shown to everyone in the meeting.'}
            </p>

            {(camError || micError) && (
              <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                {camError || micError}
              </p>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-mist-400" htmlFor="join-name">
                  Your name
                </label>
                <input
                  id="join-name"
                  className={inputClass}
                  placeholder="Mahendra"
                  maxLength={48}
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              {!isHost && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-mist-400" htmlFor="join-passcode">
                    Meeting passcode
                  </label>
                  <div className="relative">
                    <Lock size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500" />
                    <input
                      id="join-passcode"
                      className={`${inputClass} pl-9`}
                      placeholder="6-digit passcode"
                      maxLength={32}
                      value={passcode}
                      onChange={(event) => setPasscode(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-ink-700 bg-ink-950/50 p-3 text-[11px] leading-relaxed text-mist-400">
                {isHost ? (
                  <span className="flex items-start gap-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-amber-300" />
                    Guests are held in a waiting room until you admit them. You can see requests in the People panel.
                  </span>
                ) : (
                  <span className="flex items-start gap-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-zoom" />
                    After entering the passcode, the host has to admit you before you join.
                  </span>
                )}
              </div>

              {shownError && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-red-300">
                  {shownError}
                </p>
              )}
            </div>

            <div className="mt-auto pt-6">
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-zoom px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zoom-dark disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? 'Connecting…' : isHost ? 'Join as host' : 'Join meeting'}
              </button>
              <p className="mt-3 text-center text-[10px] text-mist-500">
                {micOn ? 'Mic on' : 'Mic off'} · {camOn ? 'Camera on' : 'Camera off'}
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}