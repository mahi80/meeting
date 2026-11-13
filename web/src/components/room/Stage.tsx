import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { VideoTrack } from '@livekit/components-react';
import { MonitorUp } from 'lucide-react';
import type { Box, Point, Stroke, StrokeMeta } from '../../hooks/useAnnotations';
import type { ViewMode } from '../../lib/roomTypes';
import { participantName } from '../../lib/participants';
import { cn } from '../../lib/utils';
import { AnnotationLayer } from './AnnotationLayer';
import { VideoTile } from './VideoTile';
import { Whiteboard } from './Whiteboard';

export type AnnotationState = {
  target: string;
  strokes: Stroke[];
  beginStroke: (meta: StrokeMeta) => void;
  appendPoints: (target: string, id: string, points: Point[]) => void;
  endStroke: (target: string, id: string) => void;
  undoStroke: (target: string, id: string) => void;
  clearStrokes: (target: string) => void;
};

export type WhiteboardState = {
  startedBy: string;
  local: boolean;
  strokes: Stroke[];
  beginStroke: (meta: StrokeMeta) => void;
  appendPoints: (target: string, id: string, points: Point[]) => void;
  endStroke: (target: string, id: string) => void;
  undoStroke: (target: string, id: string) => void;
  clearStrokes: (target: string) => void;
  transformStrokes: (target: string, ids: string[], from: Box, to: Box) => void;
  onClose: () => void;
};

type Props = {
  cameraTracks: TrackReferenceOrPlaceholder[];
  screenTrack: TrackReference | null;
  shareWithSound: boolean;
  annotations: AnnotationState | null;
  whiteboard: WhiteboardState | null;
  mode: ViewMode;
  onStopSharing: () => void;
};

function columnsFor(count: number) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function Filmstrip({
  tracks,
  vertical,
}: {
  tracks: TrackReferenceOrPlaceholder[];
  vertical: boolean;
}) {
  return (
    <div
      className={cn(
        'scrollbar-slim shrink-0 gap-2',
        vertical
          ? 'hidden w-44 flex-col overflow-y-auto border-l border-ink-800 p-2 md:flex'
          : 'flex overflow-x-auto px-2 pb-2 md:hidden',
      )}
    >
      {tracks.map((trackRef) => (
        <VideoTile
          key={trackRef.participant.identity}
          trackRef={trackRef}
          compact
          className={vertical ? 'aspect-video w-full' : 'h-16 w-28 shrink-0'}
        />
      ))}
    </div>
  );
}

function ScreenShareStage({
  trackRef,
  withSound,
  annotations,
  onStopSharing,
}: {
  trackRef: TrackReference;
  withSound: boolean;
  annotations: AnnotationState | null;
  onStopSharing: () => void;
}) {
  const local = trackRef.participant.isLocal;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border-2 border-ok/50 bg-black shadow-2xl shadow-black/40">
      <VideoTrack trackRef={trackRef} className="h-full w-full object-contain" />
      {annotations && (
        <AnnotationLayer
          target={annotations.target}
          strokes={annotations.strokes}
          onBegin={annotations.beginStroke}
          onAppend={annotations.appendPoints}
          onEnd={annotations.endStroke}
          onUndo={annotations.undoStroke}
          onClear={annotations.clearStrokes}
        />
      )}
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] text-mist-200 backdrop-blur">
        <MonitorUp size={12} className="text-ok" />
        <span className="max-w-[240px] truncate">
          {local ? 'You are sharing your screen' : `${participantName(trackRef.participant)} is sharing`}
        </span>
        {withSound && (
          <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-semibold text-ok">
            with sound
          </span>
        )}
        {local && (
          <button
            type="button"
            onClick={onStopSharing}
            className="ml-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-white/20"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

export function Stage({
  cameraTracks,
  screenTrack,
  shareWithSound,
  annotations,
  whiteboard,
  mode,
  onStopSharing,
}: Props) {
  if (screenTrack) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 p-2 sm:p-3">
            <ScreenShareStage
              trackRef={screenTrack}
              withSound={shareWithSound}
              annotations={annotations}
              onStopSharing={onStopSharing}
            />
          </div>
          <Filmstrip tracks={cameraTracks} vertical />
        </div>
        <Filmstrip tracks={cameraTracks} vertical={false} />
      </div>
    );
  }

  if (whiteboard) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 p-2 sm:p-3">
            <Whiteboard
              startedBy={whiteboard.startedBy}
              local={whiteboard.local}
              strokes={whiteboard.strokes}
              onBegin={whiteboard.beginStroke}
              onAppend={whiteboard.appendPoints}
              onEnd={whiteboard.endStroke}
              onUndo={whiteboard.undoStroke}
              onClear={whiteboard.clearStrokes}
              onTransform={whiteboard.transformStrokes}
              onClose={whiteboard.onClose}
            />
          </div>
          <Filmstrip tracks={cameraTracks} vertical />
        </div>
        <Filmstrip tracks={cameraTracks} vertical={false} />
      </div>
    );
  }

  if (cameraTracks.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center text-sm text-mist-500">
        Waiting for the connection…
      </div>
    );
  }

  if (mode === 'speaker') {
    const speaker =
      cameraTracks.find((trackRef) => trackRef.participant.isSpeaking) ?? cameraTracks[0];
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 p-2 sm:p-3">
            <VideoTile trackRef={speaker} className="h-full w-full" />
          </div>
          <Filmstrip tracks={cameraTracks} vertical />
        </div>
        <Filmstrip tracks={cameraTracks} vertical={false} />
      </div>
    );
  }

  const columns = columnsFor(cameraTracks.length);
  const rows = Math.ceil(cameraTracks.length / columns);
  return (
    <div className="flex min-h-0 flex-1 p-2 sm:p-3">
      <div
        className="mx-auto grid h-full w-full gap-2 sm:gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          maxWidth:
            cameraTracks.length === 1 ? '60rem' : cameraTracks.length === 2 ? '80rem' : '96rem',
        }}
      >
        {cameraTracks.map((trackRef) => (
          <VideoTile
            key={trackRef.participant.identity}
            trackRef={trackRef}
            compact={columns > 3}
            className="h-full min-h-0 w-full"
          />
        ))}
      </div>
    </div>
  );
}