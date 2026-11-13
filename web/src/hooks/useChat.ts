import { useCallback, useEffect, useState } from 'react';
import { RoomEvent, type DataPacket_Kind, type RemoteParticipant } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

export type ChatFile = {
  url: string;
  name: string;
  size: number;
  type: string;
};

export type ChatMessage = {
  id: string;
  identity: string;
  name: string;
  text: string;
  ts: number;
  local: boolean;
  file?: ChatFile;
};

const CHAT_TOPIC = 'meet-chat';
const FILE_URL = /^\/api\/files\/[A-Za-z0-9_-]{10,40}\/[^#]*$/;

function parseFile(value: unknown): ChatFile | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const file = value as Record<string, unknown>;
  if (typeof file.url !== 'string' || !FILE_URL.test(file.url)) return undefined;
  if (typeof file.name !== 'string' || !file.name.trim()) return undefined;
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0) {
    return undefined;
  }
  return {
    url: file.url,
    name: file.name.trim().slice(0, 180),
    size: file.size,
    type: typeof file.type === 'string' ? file.type.slice(0, 120) : 'application/octet-stream',
  };
}

export function useChat() {
  const room = useRoomContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      topic?: string,
    ) => {
      if (topic !== CHAT_TOPIC) return;
      try {
        const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
          message?: string;
          ts?: number;
          file?: unknown;
        };
        const text = (parsed.message ?? '').trim();
        const file = parseFile(parsed.file);
        if (!text && !file) return;
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            identity: participant?.identity ?? 'unknown',
            name: participant?.name || participant?.identity || 'Guest',
            text,
            ts: parsed.ts ?? Date.now(),
            local: false,
            file,
          },
        ]);
      } catch {
        /* ignore malformed packets */
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  const send = useCallback(
    async (text: string, file?: ChatFile) => {
      const clean = text.trim();
      if (!clean && !file) return;
      const ts = Date.now();
      const payload = new TextEncoder().encode(
        JSON.stringify({ message: clean, ts, file }),
      );
      await room.localParticipant.publishData(payload, { reliable: true, topic: CHAT_TOPIC });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          identity: room.localParticipant.identity,
          name: room.localParticipant.name || 'You',
          text: clean,
          ts,
          local: true,
          file,
        },
      ]);
    },
    [room],
  );

  return { messages, send };
}
