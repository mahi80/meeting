import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, type DataPacket_Kind, type RemoteParticipant } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

type BoardState = { active: boolean; by: string; name: string };

type Packet =
  | { t: 'open'; by: string; name: string }
  | { t: 'close' }
  | { t: 'state'; active: boolean; by: string; name: string };

const TOPIC = 'meet-whiteboard';
const EMPTY: BoardState = { active: false, by: '', name: '' };

export function useWhiteboard() {
  const room = useRoomContext();
  const [state, setState] = useState<BoardState>(EMPTY);
  const stateRef = useRef(state);
  stateRef.current = state;

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
      if (packet.t === 'open') {
        setState({ active: true, by: packet.by, name: packet.name });
      } else if (packet.t === 'close') {
        setState(EMPTY);
      } else if (packet.t === 'state') {
        setState(
          packet.active ? { active: true, by: packet.by, name: packet.name } : EMPTY,
        );
      }
    };

    const onJoin = (participant: RemoteParticipant) => {
      const current = stateRef.current;
      publish(
        {
          t: 'state',
          active: current.active,
          by: current.by,
          name: current.name,
        },
        [participant.identity],
      );
    };

    const onLeave = (participant: RemoteParticipant) => {
      if (stateRef.current.active && participant.identity === stateRef.current.by) {
        setState(EMPTY);
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantDisconnected, onLeave);
    };
  }, [room, publish]);

  const open = useCallback(() => {
    const by = room.localParticipant.identity;
    const name = room.localParticipant.name || by;
    setState({ active: true, by, name });
    publish({ t: 'open', by, name });
  }, [publish, room]);

  const close = useCallback(() => {
    setState(EMPTY);
    publish({ t: 'close' });
  }, [publish]);

  return {
    active: state.active,
    by: state.by,
    startedBy: state.name,
    open,
    close,
  };
}
