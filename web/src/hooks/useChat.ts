import { useCallback, useEffect, useState } from 'react';
import { RoomEvent, type DataPacket_Kind, type RemoteParticipant } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

export type ChatMessage = {
  id: string;
  identity: string;
  name: string;
  text: string;
  ts: number;
  local: boolean;
};

const CHAT_TOPIC = 'meet-chat';

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
        };
        const text = (parsed.message ?? '').trim();
        if (!text) return;
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            identity: participant?.identity ?? 'unknown',
            name: participant?.name || participant?.identity || 'Guest',
            text,
            ts: parsed.ts ?? Date.now(),
            local: false,
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
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const ts = Date.now();
      const payload = new TextEncoder().encode(JSON.stringify({ message: clean, ts }));
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
        },
      ]);
    },
    [room],
  );

  return { messages, send };
}