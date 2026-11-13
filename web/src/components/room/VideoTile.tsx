import {
  isTrackReference,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { Crown, Mic, MicOff } from 'lucide-react';
import { cn, initials } from '../../lib/utils';
import {
  avatarClass,
  isHostParticipant,
  isMicEnabled,
  participantName,
} from '../../lib/participants';

type Props = {
  trackRef: TrackReferenceOrPlaceholder;
  className?: string;
  compact?: boolean;
};

export function VideoTile({ trackRef, className, compact }: Props) {
  const { participant } = trackRef;
  const name = participantName(participant);
  const local = participant.isLocal;
  const host = isHostParticipant(participant);
  const micOn = isMicEnabled(participant);
  const hasVideo =
    isTrackReference(trackRef) && !trackRef.publication.isMuted && Boolean(trackRef.publication.track);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-ink-800',
        participant.isSpeaking ? 'border-ok/70 shadow-[0_0_0_2px_rgba(47,191,113,0.22)]' : 'border-ink-700',
        className,
      )}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn('h-full w-full object-cover', local && '-scale-x-100')}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_35%,#1e2631,#101419_75%)]">
          <span
            className={cn(
              'grid place-items-center rounded-full font-semibold',
              avatarClass(name),
              compact ? 'h-9 w-9 text-xs' : 'h-16 w-16 text-xl',
            )}
          >
            {initials(name)}
          </span>
        </div>
      )}

      {!hasVideo && !compact && (
        <span className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-mist-300">
          Camera off
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2">
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-md bg-black/45 font-medium text-mist-100 backdrop-blur',
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
          )}
        >
          {micOn ? (
            <Mic size={compact ? 9 : 11} className="shrink-0 text-mist-300" />
          ) : (
            <MicOff size={compact ? 9 : 11} className="shrink-0 text-danger" />
          )}
          <span className="truncate">
            {name}
            {local ? ' (You)' : ''}
          </span>
          {host && <Crown size={compact ? 9 : 11} className="shrink-0 text-amber-400" />}
        </span>
        {participant.isSpeaking && !compact && (
          <span className="rounded bg-ok/20 px-1.5 py-0.5 text-[9px] font-semibold text-ok">Speaking</span>
        )}
      </div>
    </div>
  );
}