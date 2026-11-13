import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Eraser, PenLine, Trash2, Undo2, X } from 'lucide-react';
import type { Point, Stroke, StrokeMeta } from '../../hooks/useAnnotations';
import { paintStrokes, roundPoint } from '../../lib/strokes';
import { cn } from '../../lib/utils';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff'];
const PEN_WIDTH = 4;
const ERASER_WIDTH = 22;

type Rect = { left: number; top: number; width: number; height: number };
type Tool = 'pen' | 'eraser';

type Props = {
  target: string;
  strokes: Stroke[];
  onBegin: (meta: StrokeMeta) => void;
  onAppend: (target: string, id: string, points: Point[]) => void;
  onEnd: (target: string, id: string) => void;
  onUndo: (target: string, id: string) => void;
  onClear: (target: string) => void;
};

function paint(
  canvas: HTMLCanvasElement,
  rect: Rect,
  dpr: number,
  strokes: Stroke[],
  draft: Stroke | null,
) {
  paintStrokes(canvas, rect.width, rect.height, dpr, strokes, draft);
}

export function AnnotationLayer({
  target,
  strokes,
  onBegin,
  onAppend,
  onEnd,
  onUndo,
  onClear,
}: Props) {
  const room = useRoomContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Stroke | null>(null);
  const pendingRef = useRef<{ id: string; points: Point[]; sentAt: number } | null>(null);
  const dprRef = useRef(1);
  const [rect, setRect] = useState<Rect | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rect) return;
    paint(canvas, rect, dprRef.current, strokes, draftRef.current);
  }, [rect, strokes]);

  useEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return;

    const update = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      const video = host.querySelector('video');
      const videoWidth = video?.videoWidth ?? 0;
      const videoHeight = video?.videoHeight ?? 0;
      if (!videoWidth || !videoHeight) {
        setRect({ left: 0, top: 0, width, height });
        return;
      }
      const scale = Math.min(width / videoWidth, height / videoHeight);
      const contentWidth = videoWidth * scale;
      const contentHeight = videoHeight * scale;
      setRect({
        left: (width - contentWidth) / 2,
        top: (height - contentHeight) / 2,
        width: contentWidth,
        height: contentHeight,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    const interval = window.setInterval(update, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [target]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rect) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    draw();
  }, [rect, draw]);

  useEffect(() => {
    draw();
  }, [draw, strokes]);

  const toPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    return { x: roundPoint(x), y: roundPoint(y) };
  };

  const flushPending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending.points.length === 0) return;
    onAppend(target, pending.id, pending.points);
    pending.points = [];
    pending.sentAt = performance.now();
  }, [onAppend, target]);

  const handleDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!annotating || !rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toPoint(event);
    if (!point) return;

    const meta: StrokeMeta = {
      id: crypto.randomUUID(),
      target,
      by: room.localParticipant.identity,
      color: tool === 'eraser' ? '#000000' : color,
      width: tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH,
      erase: tool === 'eraser',
    };
    draftRef.current = { ...meta, points: [point] };
    pendingRef.current = { id: meta.id, points: [point], sentAt: performance.now() };
    onBegin(meta);
    onAppend(target, meta.id, [point]);
    draw();
  };

  const handleMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const draft = draftRef.current;
    if (!draft || !annotating) return;
    const point = toPoint(event);
    if (!point) return;
    const last = draft.points[draft.points.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.0008 && Math.abs(last.y - point.y) < 0.0008) {
      return;
    }
    draft.points.push(point);
    pendingRef.current?.points.push(point);

    const pending = pendingRef.current;
    if (pending && performance.now() - pending.sentAt > 60) flushPending();
    draw();
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const draft = draftRef.current;
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    flushPending();
    onEnd(target, draft.id);
    draftRef.current = null;
    pendingRef.current = null;
    draw();
  };

  const lastStroke = strokes.length > 0 ? strokes[strokes.length - 1] : null;

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20">
      {rect && (
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          className={cn(
            'absolute',
            annotating ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none',
          )}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            touchAction: 'none',
          }}
        />
      )}

      <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-white/10 bg-black/75 p-1 backdrop-blur">
        <button
          type="button"
          onClick={() => setAnnotating((value) => !value)}
          title={annotating ? 'Stop annotating' : 'Annotate the shared screen'}
          aria-label={annotating ? 'Stop annotating' : 'Annotate the shared screen'}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition',
            annotating
              ? 'bg-zoom/25 text-zoom'
              : 'text-mist-200 hover:bg-white/10 hover:text-white',
          )}
        >
          {annotating ? <X size={14} /> : <PenLine size={14} />}
          <span className="hidden sm:inline">{annotating ? 'Done' : 'Annotate'}</span>
        </button>

        {annotating && (
          <>
            <span className="mx-0.5 h-5 w-px bg-white/15" />
            {COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  setColor(swatch);
                  setTool('pen');
                }}
                title={`Pen color ${swatch}`}
                aria-label={`Pen color ${swatch}`}
                className={cn(
                  'h-5 w-5 rounded-full border-2 transition',
                  tool === 'pen' && color === swatch
                    ? 'scale-110 border-white'
                    : 'border-white/20 hover:border-white/60',
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
            <span className="mx-0.5 h-5 w-px bg-white/15" />
            <button
              type="button"
              onClick={() => setTool((value) => (value === 'eraser' ? 'pen' : 'eraser'))}
              title="Eraser"
              aria-label="Eraser"
              className={cn(
                'grid h-7 w-7 place-items-center rounded-md transition',
                tool === 'eraser'
                  ? 'bg-zoom/25 text-zoom'
                  : 'text-mist-200 hover:bg-white/10 hover:text-white',
              )}
            >
              <Eraser size={14} />
            </button>
            <button
              type="button"
              onClick={() => lastStroke && onUndo(target, lastStroke.id)}
              disabled={!lastStroke}
              title="Undo last stroke"
              aria-label="Undo last stroke"
              className="grid h-7 w-7 place-items-center rounded-md text-mist-200 transition hover:bg-white/10 hover:text-white disabled:opacity-35"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => onClear(target)}
              disabled={strokes.length === 0}
              title="Clear all annotations"
              aria-label="Clear all annotations"
              className="grid h-7 w-7 place-items-center rounded-md text-mist-200 transition hover:bg-white/10 hover:text-white disabled:opacity-35"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
