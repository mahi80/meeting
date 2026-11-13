import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, type DataPacket_Kind, type RemoteParticipant } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

export type Point = { x: number; y: number };

export type Stroke = {
  id: string;
  /** identity of the participant whose screen is being annotated */
  target: string;
  by: string;
  color: string;
  /** stroke width in pixels relative to a 720px-tall video */
  width: number;
  erase: boolean;
  points: Point[];
};

export type StrokeMeta = Omit<Stroke, 'points'>;

export type Box = { x: number; y: number; w: number; h: number };

const TOPIC = 'meet-annotate';
const MAX_STROKES = 400;

type Packet =
  | { t: 'b'; s: StrokeMeta }
  | { t: 'p'; target: string; id: string; pts: Point[] }
  | { t: 'e'; target: string; id: string }
  | { t: 'u'; target: string; id: string }
  | { t: 'x'; target: string; ids: string[]; from: Box; to: Box }
  | { t: 'c'; target: string };

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function transformStroke(stroke: Stroke, from: Box, to: Box): Stroke {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  return {
    ...stroke,
    width: Math.max(1, Math.min(80, stroke.width * Math.abs(sy))),
    points: stroke.points.map((point) => ({
      x: clamp01(to.x + (point.x - from.x) * sx),
      y: clamp01(to.y + (point.y - from.y) * sy),
    })),
  };
}

function transformList(list: Stroke[], ids: string[], from: Box, to: Box) {
  if (from.w <= 0 || from.h <= 0 || to.w <= 0 || to.h <= 0) return list;
  if (
    from.x === to.x &&
    from.y === to.y &&
    from.w === to.w &&
    from.h === to.h
  ) {
    return list;
  }
  const selected = new Set(ids);
  let changed = false;
  const next = list.map((stroke) => {
    if (!selected.has(stroke.id)) return stroke;
    changed = true;
    return transformStroke(stroke, from, to);
  });
  return changed ? next : list;
}

function appendPoints(
  current: Record<string, Stroke[]>,
  target: string,
  id: string,
  points: Point[],
) {
  const list = current[target];
  if (!list) return current;
  const index = list.findIndex((stroke) => stroke.id === id);
  if (index === -1) return current;
  const next = list.slice();
  next[index] = { ...list[index], points: [...list[index].points, ...points] };
  return { ...current, [target]: next };
}

export function useAnnotations() {
  const room = useRoomContext();
  const [strokes, setStrokes] = useState<Record<string, Stroke[]>>({});
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      _participant?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      topic?: string,
    ) => {
      if (topic !== TOPIC) return;
      let packet: Packet;
      try {
        packet = JSON.parse(new TextDecoder().decode(payload)) as Packet;
      } catch {
        return;
      }

      if (packet.t === 'b') {
        const stroke = packet.s;
        if (!stroke?.id || !stroke.target) return;
        setStrokes((current) => {
          const list = current[stroke.target] ?? [];
          if (list.some((item) => item.id === stroke.id)) return current;
          const next = [...list, { ...stroke, points: [] }].slice(-MAX_STROKES);
          return { ...current, [stroke.target]: next };
        });
        return;
      }

      if (packet.t === 'p') {
        if (!packet.target || !packet.id || !Array.isArray(packet.pts)) return;
        setStrokes((current) => appendPoints(current, packet.target, packet.id, packet.pts));
        return;
      }

      if (packet.t === 'u') {
        setStrokes((current) => {
          const list = current[packet.target];
          if (!list) return current;
          return { ...current, [packet.target]: list.filter((stroke) => stroke.id !== packet.id) };
        });
        return;
      }

      if (packet.t === 'x') {
        if (!packet.target || !Array.isArray(packet.ids) || !packet.from || !packet.to) return;
        setStrokes((current) => {
          const list = current[packet.target];
          if (!list) return current;
          const next = transformList(list, packet.ids, packet.from, packet.to);
          return next === list ? current : { ...current, [packet.target]: next };
        });
        return;
      }

      if (packet.t === 'c') {
        setStrokes((current) => {
          if (!current[packet.target]?.length) return current;
          return { ...current, [packet.target]: [] };
        });
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  const publish = useCallback(
    (packet: Packet, destinations?: string[]) => {
      void room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(packet)), {
          reliable: true,
          topic: TOPIC,
          destinationIdentities: destinations,
        })
        .catch(() => undefined);
    },
    [room],
  );

  // Send the current drawing to someone who joined (or reloaded) mid-share.
  useEffect(() => {
    const onJoin = (participant: RemoteParticipant) => {
      for (const [target, list] of Object.entries(strokesRef.current)) {
        for (const stroke of list) {
          const { points, ...meta } = stroke;
          publish({ t: 'b', s: meta }, [participant.identity]);
          if (points.length > 0) {
            publish({ t: 'p', target, id: stroke.id, pts: points }, [participant.identity]);
          }
        }
      }
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
    };
  }, [room, publish]);

  const beginStroke = useCallback(
    (meta: StrokeMeta) => {
      setStrokes((current) => {
        const list = current[meta.target] ?? [];
        if (list.some((stroke) => stroke.id === meta.id)) return current;
        return { ...current, [meta.target]: [...list, { ...meta, points: [] }].slice(-MAX_STROKES) };
      });
      publish({ t: 'b', s: meta });
    },
    [publish],
  );

  const appendPointsTo = useCallback(
    (target: string, id: string, points: Point[]) => {
      if (!points.length) return;
      setStrokes((current) => appendPoints(current, target, id, points));
      publish({ t: 'p', target, id, pts: points });
    },
    [publish],
  );

  const endStroke = useCallback(
    (target: string, id: string) => {
      publish({ t: 'e', target, id });
    },
    [publish],
  );

  const undoStroke = useCallback(
    (target: string, id: string) => {
      setStrokes((current) => {
        const list = current[target];
        if (!list) return current;
        return { ...current, [target]: list.filter((stroke) => stroke.id !== id) };
      });
      publish({ t: 'u', target, id });
    },
    [publish],
  );

  const clearStrokes = useCallback(
    (target: string) => {
      setStrokes((current) => {
        if (!current[target]?.length) return current;
        return { ...current, [target]: [] };
      });
      publish({ t: 'c', target });
    },
    [publish],
  );

  const transformStrokes = useCallback(
    (target: string, ids: string[], from: Box, to: Box) => {
      if (ids.length === 0) return;
      setStrokes((current) => {
        const list = current[target];
        if (!list) return current;
        const next = transformList(list, ids, from, to);
        return next === list ? current : { ...current, [target]: next };
      });
      publish({ t: 'x', target, ids, from, to });
    },
    [publish],
  );

  return {
    strokes,
    beginStroke,
    appendPoints: appendPointsTo,
    endStroke,
    undoStroke,
    clearStrokes,
    transformStrokes,
  };
}
