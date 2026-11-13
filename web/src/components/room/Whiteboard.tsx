import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Eraser, PenLine, Trash2, Undo2 } from 'lucide-react';
import type { Point, Stroke, StrokeMeta } from '../../hooks/useAnnotations';
import { paintStrokes, roundPoint } from '../../lib/strokes';
import { cn } from '../../lib/utils';

const COLORS = ['#0f172a', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];
const SIZES = [2, 4, 8];
const ERASER_WIDTH = 24;

type Tool = 'pen' | 'eraser';

type Props = {
  startedBy: string;
  local: boolean;
  strokes: Stroke[];
  onBegin: (meta: StrokeMeta) => void;
  onAppend: (target: string, id: string, points: Point[]) => void;
  onEnd: (target: string, id: string) => void;
  onUndo: (target: string, id: string) => void;
  onClear: (target: string) => void;
  onClose: () => void;
};

export function Whiteboard({
  startedBy,
  local,
  strokes,
  onBegin,
  onAppend,
  onEnd,
  onUndo,
  onClear,
  onClose,
}: Props) {
  const room = useRoomContext();
  const target = 'whiteboard';
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Stroke | null>(null);
  const pendingRef = useRef<{ id: string; points: Point[]; sentAt: number } | null>(null);
  const dprRef = useRef(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(SIZES[1]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    paintStrokes(canvas, size.width, size.height, dprRef.current, strokes, draftRef.current);
  }, [size, strokes]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const next = { width: root.clientWidth, height: root.clientHeight };
      if (!next.width || !next.height) return;
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    canvas.width = Math.max(1, Math.round(size.width * dpr));
    canvas.height = Math.max(1, Math.round(size.height * dpr));
    draw();
  }, [size, draw]);

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
  }, [onAppend]);

  const handleDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!size.width || !size.height) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toPoint(event);
    if (!point) return;

    const meta: StrokeMeta = {
      id: crypto.randomUUID(),
      target,
      by: room.localParticipant.identity,
      color: tool === 'eraser' ? '#000000' : color,
      width: tool === 'eraser' ? ERASER_WIDTH : width,
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
    if (!draft) return;
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
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden rounded-xl border-2 border-ink-600 bg-white shadow-2xl shadow-black/40"
      style={{
        backgroundImage: 'radial-gradient(#dbe3ee 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Whiteboard canvas"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="absolute inset-0 h-full w-full cursor-crosshair"
        style={{ touchAction: 'none' }}
      />

      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/75 px-2.5 py-1.5 text-[11px] text-mist-200 backdrop-blur">
        <PenLine size={12} className="text-ok" />
        <span className="max-w-[260px] truncate">
          {local ? 'You started the whiteboard' : `${startedBy || 'Someone'} started the whiteboard`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close whiteboard"
          className="ml-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-white/20"
        >
          Close
        </button>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-white/10 bg-black/75 p-1 backdrop-blur">
        {SIZES.map((penSize) => (
          <button
            key={penSize}
            type="button"
            onClick={() => {
              setWidth(penSize);
              setTool('pen');
            }}
            title={`Pen size ${penSize}`}
            aria-label={`Pen size ${penSize}`}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-md transition',
              tool === 'pen' && width === penSize
                ? 'bg-zoom/25'
                : 'hover:bg-white/10',
            )}
          >
            <span
              className="rounded-full bg-white"
              style={{ width: penSize + 4, height: penSize + 4 }}
            />
          </button>
        ))}
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
          title="Clear whiteboard"
          aria-label="Clear whiteboard"
          className="grid h-7 w-7 place-items-center rounded-md text-mist-200 transition hover:bg-white/10 hover:text-white disabled:opacity-35"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
