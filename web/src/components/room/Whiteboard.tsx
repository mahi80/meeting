import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Eraser, Hand, MousePointer2, PenLine, Trash2, Undo2 } from 'lucide-react';
import type { Box, Point, Stroke, StrokeMeta } from '../../hooks/useAnnotations';
import { transformStroke } from '../../hooks/useAnnotations';
import { paintWorldStrokes, roundPoint } from '../../lib/strokes';
import { cn } from '../../lib/utils';

const COLORS = ['#0f172a', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];
const SIZES = [2, 4, 8];
const ERASER_WIDTH = 24;
const MIN_BOX = 8;
const GRID = 24;

type Tool = 'pen' | 'eraser' | 'select' | 'pan';
type Handle = 'nw' | 'ne' | 'sw' | 'se';

const HANDLES: Array<{ key: Handle; label: string; style: Record<string, string> }> = [
  { key: 'nw', label: 'Resize top left', style: { left: '0%', top: '0%', cursor: 'nwse-resize' } },
  { key: 'ne', label: 'Resize top right', style: { left: '100%', top: '0%', cursor: 'nesw-resize' } },
  { key: 'sw', label: 'Resize bottom left', style: { left: '0%', top: '100%', cursor: 'nesw-resize' } },
  { key: 'se', label: 'Resize bottom right', style: { left: '100%', top: '100%', cursor: 'nwse-resize' } },
];

type Props = {
  startedBy: string;
  local: boolean;
  strokes: Stroke[];
  onBegin: (meta: StrokeMeta) => void;
  onAppend: (target: string, id: string, points: Point[]) => void;
  onEnd: (target: string, id: string) => void;
  onUndo: (target: string, id: string) => void;
  onClear: (target: string) => void;
  onTransform: (target: string, ids: string[], from: Box, to: Box) => void;
  onClose: () => void;
};

function boundsOf(strokes: Stroke[], ids: string[]): Box | null {
  const selected = new Set(ids);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const stroke of strokes) {
    if (!selected.has(stroke.id)) continue;
    for (const point of stroke.points) {
      found = true;
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!found) return null;
  let x = minX;
  let y = minY;
  let w = maxX - minX;
  let h = maxY - minY;
  if (w < MIN_BOX) {
    x -= (MIN_BOX - w) / 2;
    w = MIN_BOX;
  }
  if (h < MIN_BOX) {
    y -= (MIN_BOX - h) / 2;
    h = MIN_BOX;
  }
  return { x, y, w, h };
}

function keyboardTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName)
  );
}

export function Whiteboard({
  startedBy,
  local,
  strokes,
  onBegin,
  onAppend,
  onEnd,
  onUndo,
  onClear,
  onTransform,
  onClose,
}: Props) {
  const room = useRoomContext();
  const target = 'whiteboard';
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Stroke | null>(null);
  const pendingRef = useRef<{ id: string; points: Point[]; sentAt: number } | null>(null);
  const marqueeStartRef = useRef<Point | null>(null);
  const panRef = useRef<{ startX: number; startY: number; view: Point } | null>(null);
  const spaceRef = useRef(false);
  const dprRef = useRef(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Point>({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(SIZES[1]);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [resize, setResize] = useState<{ ids: string[]; from: Box; to: Box } | null>(null);

  const displayStrokes = useMemo(() => {
    if (!resize) return strokes;
    const selected = new Set(resize.ids);
    return strokes.map((stroke) =>
      selected.has(stroke.id) ? transformStroke(stroke, resize.from, resize.to) : stroke,
    );
  }, [strokes, resize]);

  const selectionBounds = useMemo(
    () => (selection ? boundsOf(strokes, selection) : null),
    [strokes, selection],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    paintWorldStrokes(canvas, dprRef.current, displayStrokes, draftRef.current, view);
  }, [size, displayStrokes, view]);

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
  }, [draw, displayStrokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      setView((current) => ({
        x: current.x + event.deltaX * unit,
        y: current.y + event.deltaY * unit,
      }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || keyboardTarget(event.target) || spaceRef.current) return;
      event.preventDefault();
      spaceRef.current = true;
      setSpaceDown(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceDown(false);
    };
    const blur = () => {
      spaceRef.current = false;
      setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    if (!selection) return;
    const ids = new Set(strokes.map((stroke) => stroke.id));
    const kept = selection.filter((id) => ids.has(id));
    if (kept.length !== selection.length) setSelection(kept.length ? kept : null);
  }, [strokes, selection]);

  const toWorld = (event: { clientX: number; clientY: number }): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return {
      x: roundPoint(event.clientX - box.left + view.x),
      y: roundPoint(event.clientY - box.top + view.y),
    };
  };

  const flushPending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending.points.length === 0) return;
    onAppend(target, pending.id, pending.points);
    pending.points = [];
    pending.sentAt = performance.now();
  }, [onAppend]);

  const chooseTool = (next: Tool) => {
    setTool(next);
    if (next !== 'select') {
      setSelection(null);
      setMarquee(null);
      marqueeStartRef.current = null;
    }
  };

  const handleDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!size.width || !size.height) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'pan' || event.button === 1 || spaceRef.current) {
      panRef.current = { startX: event.clientX, startY: event.clientY, view };
      return;
    }

    const point = toWorld(event);
    if (!point) return;

    if (tool === 'select') {
      marqueeStartRef.current = point;
      setSelection(null);
      setMarquee({ x: point.x, y: point.y, w: 0, h: 0 });
      return;
    }

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
    const pan = panRef.current;
    if (pan) {
      setView({
        x: pan.view.x - (event.clientX - pan.startX),
        y: pan.view.y - (event.clientY - pan.startY),
      });
      return;
    }

    if (tool === 'select') {
      const start = marqueeStartRef.current;
      if (!start) return;
      const point = toWorld(event);
      if (!point) return;
      setMarquee({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        w: Math.abs(point.x - start.x),
        h: Math.abs(point.y - start.y),
      });
      return;
    }

    const draft = draftRef.current;
    if (!draft) return;
    const point = toWorld(event);
    if (!point) return;
    const last = draft.points[draft.points.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) {
      return;
    }
    draft.points.push(point);
    pendingRef.current?.points.push(point);

    const pending = pendingRef.current;
    if (pending && performance.now() - pending.sentAt > 60) flushPending();
    draw();
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (panRef.current) {
      panRef.current = null;
      return;
    }

    if (tool === 'select') {
      const start = marqueeStartRef.current;
      marqueeStartRef.current = null;
      setMarquee(null);
      const end = toWorld(event);
      if (!start || !end) return;
      const area = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
      };
      if (area.w < 6 || area.h < 6) {
        setSelection(null);
        return;
      }
      const ids = strokes
        .filter((stroke) =>
          stroke.points.some(
            (point) =>
              point.x >= area.x &&
              point.x <= area.x + area.w &&
              point.y >= area.y &&
              point.y <= area.y + area.h,
          ),
        )
        .map((stroke) => stroke.id);
      setSelection(ids.length ? ids : null);
      return;
    }

    const draft = draftRef.current;
    if (!draft) return;
    flushPending();
    onEnd(target, draft.id);
    draftRef.current = null;
    pendingRef.current = null;
    draw();
  };

  const startResize = (handle: Handle) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!selectionBounds || !selection) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResize({ ids: selection, from: selectionBounds, to: selectionBounds });
    void handle;
  };

  const dragResize = (handle: Handle) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resize) return;
    const point = toWorld(event);
    if (!point) return;
    const from = resize.from;
    const anchorX = handle === 'nw' || handle === 'sw' ? from.x + from.w : from.x;
    const anchorY = handle === 'nw' || handle === 'ne' ? from.y + from.h : from.y;
    const x = Math.min(anchorX, point.x);
    const y = Math.min(anchorY, point.y);
    const w = Math.max(8, Math.abs(point.x - anchorX));
    const h = Math.max(8, Math.abs(point.y - anchorY));
    setResize({ ids: resize.ids, from, to: { x, y, w, h } });
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!resize) return;
    const { ids, from, to } = resize;
    setResize(null);
    if (from.x !== to.x || from.y !== to.y || from.w !== to.w || from.h !== to.h) {
      onTransform(target, ids, from, to);
    }
  };

  const lastStroke = strokes.length > 0 ? strokes[strokes.length - 1] : null;
  const shownBox = resize ? resize.to : selectionBounds;
  const screenBox = shownBox
    ? { x: shownBox.x - view.x, y: shownBox.y - view.y, w: shownBox.w, h: shownBox.h }
    : null;
  const panMode = tool === 'pan' || spaceDown;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden rounded-xl border-2 border-ink-600 bg-white shadow-2xl shadow-black/40"
      style={{
        backgroundImage: 'radial-gradient(#dbe3ee 1px, transparent 1px)',
        backgroundSize: `${GRID}px ${GRID}px`,
        backgroundPosition: `${-view.x}px ${-view.y}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Whiteboard canvas"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onAuxClick={(event) => event.preventDefault()}
        className={cn(
          'absolute inset-0 h-full w-full',
          panMode
            ? 'cursor-grab active:cursor-grabbing'
            : tool === 'select'
              ? 'cursor-default'
              : 'cursor-crosshair',
        )}
        style={{ touchAction: 'none' }}
      />

      {tool === 'select' && marquee && (
        <div
          className="pointer-events-none absolute z-10 border border-zoom/80 bg-zoom/10"
          style={{
            left: marquee.x - view.x,
            top: marquee.y - view.y,
            width: marquee.w,
            height: marquee.h,
          }}
        />
      )}

      {tool === 'select' && screenBox && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: screenBox.x,
            top: screenBox.y,
            width: screenBox.w,
            height: screenBox.h,
          }}
        >
          <div className="absolute inset-0 rounded border border-dashed border-zoom/80" />
          {HANDLES.map((handle) => (
            <button
              key={handle.key}
              type="button"
              aria-label={handle.label}
              onPointerDown={startResize(handle.key)}
              onPointerMove={dragResize(handle.key)}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
              className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-zoom shadow"
              style={handle.style}
            />
          ))}
        </div>
      )}

      <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-md bg-black/75 px-2.5 py-1.5 text-[11px] text-mist-200 backdrop-blur">
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

      <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-white/10 bg-black/75 p-1 backdrop-blur">
        <button
          type="button"
          onClick={() => chooseTool(tool === 'pan' ? 'pen' : 'pan')}
          title="Pan canvas (drag, wheel, or hold Space)"
          aria-label="Pan canvas"
          className={cn(
            'grid h-7 w-7 place-items-center rounded-md transition',
            tool === 'pan'
              ? 'bg-zoom/25 text-zoom'
              : 'text-mist-200 hover:bg-white/10 hover:text-white',
          )}
        >
          <Hand size={14} />
        </button>
        <button
          type="button"
          onClick={() => chooseTool(tool === 'select' ? 'pen' : 'select')}
          title="Select and resize"
          aria-label="Select and resize"
          className={cn(
            'grid h-7 w-7 place-items-center rounded-md transition',
            tool === 'select'
              ? 'bg-zoom/25 text-zoom'
              : 'text-mist-200 hover:bg-white/10 hover:text-white',
          )}
        >
          <MousePointer2 size={14} />
        </button>
        <span className="mx-0.5 h-5 w-px bg-white/15" />
        {SIZES.map((penSize) => (
          <button
            key={penSize}
            type="button"
            onClick={() => {
              setWidth(penSize);
              chooseTool('pen');
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
              chooseTool('pen');
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
          onClick={() => chooseTool(tool === 'eraser' ? 'pen' : 'eraser')}
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
          onClick={() => {
            onClear(target);
            setSelection(null);
          }}
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
