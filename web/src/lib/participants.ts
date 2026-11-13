import { Track, type Participant } from 'livekit-client';

const AVATAR_COLORS = [
  'bg-[#2f4f6f] text-[#cfe6ff]',
  'bg-[#3d4a2f] text-[#e2f5c0]',
  'bg-[#5a3b2f] text-[#ffd9c7]',
  'bg-[#46335f] text-[#e6d4ff]',
  'bg-[#2f5a55] text-[#c9fff5]',
  'bg-[#5c2f43] text-[#ffd3e1]',
  'bg-[#4a4630] text-[#f5ecc0]',
];

export function participantName(participant: Participant) {
  return participant.name || participant.identity;
}

export function isHostParticipant(participant: Participant) {
  if (participant.identity === 'host') return true;
  try {
    const metadata = JSON.parse(participant.metadata || '{}') as { role?: string };
    return metadata.role === 'host';
  } catch {
    return false;
  }
}

export function isMicEnabled(participant: Participant) {
  const publication = participant.getTrackPublication(Track.Source.Microphone);
  return Boolean(publication && !publication.isMuted && publication.track);
}

export function isCameraEnabled(participant: Participant) {
  const publication = participant.getTrackPublication(Track.Source.Camera);
  return Boolean(publication && !publication.isMuted && publication.track);
}

export function avatarClass(name: string) {
  const sum = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}