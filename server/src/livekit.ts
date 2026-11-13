import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from './config.js';

const roomService = new RoomServiceClient(
  config.livekitHttpUrl,
  config.livekitApiKey,
  config.livekitApiSecret,
);

export type Role = 'host' | 'guest';

export function roomNameFor(meetingId: string) {
  return `meeting-${meetingId}`;
}

export async function ensureRoom(meetingId: string) {
  try {
    await roomService.createRoom({
      name: roomNameFor(meetingId),
      emptyTimeout: 10 * 60,
      departureTimeout: 20,
      maxParticipants: 100,
    });
  } catch (err) {
    // Room already exists or LiveKit is temporarily unreachable; joining still
    // creates the room on demand, so this is not fatal.
    console.warn('[livekit] createRoom:', (err as Error).message);
  }
}

export async function createToken(options: {
  meetingId: string;
  identity: string;
  name: string;
  role: Role;
}) {
  const { meetingId, identity, name, role } = options;
  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    name,
    ttl: config.tokenTtlSeconds,
    metadata: JSON.stringify({ role }),
  });

  token.addGrant({
    room: roomNameFor(meetingId),
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    roomAdmin: role === 'host',
  });

  return token.toJwt();
}