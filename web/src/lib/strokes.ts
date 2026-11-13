import type { Stroke } from '../hooks/useAnnotations';

const REFERENCE_HEIGHT = 720;

export function paintStrokes(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
  strokes: Stroke[],
  draft: Stroke | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const scale = height / REFERENCE_HEIGHT;
  const all = draft ? [...strokes, draft] : strokes;
  for (const stroke of all) {
    if (stroke.points.length === 0) continue;
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = Math.max(1, stroke.width * scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const first = stroke.points[0];
    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(first.x * width, first.y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(first.x * width, first.y * height);
    for (let i = 1; i < stroke.points.length; i += 1) {
      const point = stroke.points[i];
      ctx.lineTo(point.x * width, point.y * height);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function roundPoint(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
