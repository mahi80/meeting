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

const TOPIC = 'meet-annotate';
const MAX_STROKES = 400;

type Packet =
  | { t: 'b'; s: StrokeMeta }
  | { t: 'p'; target: string; id: string; pts: Point[] }
  | { t: 'e'; target: string; id: string }
  | { t: 'u'; target: string; id: string }
  | { t: 'c'; target: string };

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

  return { strokes, beginStroke, appendPoints: appendPointsTo, endStroke, undoStroke, clearStrokes };
}
