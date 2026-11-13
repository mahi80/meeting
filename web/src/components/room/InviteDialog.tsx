import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Lock, MessageCircle, Share2, X } from 'lucide-react';
import { copyText, nativeShare, whatsappShareUrl } from '../../lib/utils';

type Props = {
  open: boolean;
  title: string;
  meetingId: string;
  passcode: string;
  onClose: () => void;
  showToast: (message: string) => void;
};

export function InviteDialog({ open, title, meetingId, passcode, onClose, showToast }: Props) {
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopied(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const origin = window.location.origin;
  const inviteUrl = `${origin}/m/${meetingId}${passcode ? `#p=${encodeURIComponent(passcode)}` : ''}`;
  const inviteText = [
    `Join my meeting "${title}"`,
    inviteUrl,
    passcode ? `Passcode: ${passcode}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  async function copy(kind: 'link' | 'text') {
    const ok = await copyText(kind === 'link' ? inviteUrl : inviteText);
    if (ok) {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } else {
      showToast('Copy failed');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-fade"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Invite people"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl shadow-black/50 animate-rise"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Invite people</h2>
            <p className="mt-1 text-xs text-mist-500">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mist-500">
            Meeting link
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-950/60 p-1.5">
            <Link2 size={14} className="ml-1.5 shrink-0 text-mist-500" />
            <input
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-1 text-xs text-mist-200"
            />
            <button
              type="button"
              onClick={() => void copy('link')}
              className="flex shrink-0 items-center gap-1 rounded-md bg-ink-800 px-2.5 py-1.5 text-[10px] font-semibold text-mist-200 transition hover:bg-ink-700"
            >
              {copied === 'link' ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
              {copied === 'link' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-ink-700 bg-ink-950/40 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-mist-400">
            <Lock size={12} /> Passcode
          </span>
          <span className="font-mono text-sm font-semibold tracking-[0.18em] text-mist-100">
            {passcode || 'set at creation'}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <a
            href={whatsappShareUrl(inviteText)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-wa px-3 py-2.5 text-xs font-semibold text-[#062b14] transition hover:brightness-110"
          >
            <MessageCircle size={15} /> Share on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void copy('text')}
            className="flex items-center justify-center gap-2 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-xs font-semibold text-mist-100 transition hover:bg-ink-700"
          >
            {copied === 'text' ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
            {copied === 'text' ? 'Invite copied' : 'Copy invite text'}
          </button>
        </div>

        {'share' in navigator && (
          <button
            type="button"
            onClick={() => {
              void nativeShare(inviteText).then((shared) => {
                if (!shared) showToast('Sharing was cancelled');
              });
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
          >
            <Share2 size={12} /> Share via…
          </button>
        )}

        <p className="mt-4 text-[10px] leading-relaxed text-mist-500">
          Guests enter the passcode, then wait until you admit them from the People panel. The link
          includes the passcode after the “#”.
        </p>
      </div>
    </div>
  );
}