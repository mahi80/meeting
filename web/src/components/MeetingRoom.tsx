import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  isTrackReference,
  useLocalParticipant,
  useParticipants,
  useConnectionState,
  useRoomContext,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import { AudioPresets, ConnectionState, Track, VideoPresets, type RoomOptions } from 'livekit-client';
import { AlertTriangle } from 'lucide-react';
import type { MeetingInfo } from '../lib/api';
import type { Panel, Session, ViewMode } from '../lib/roomTypes';
import { isCameraEnabled, isMicEnabled } from '../lib/participants';
import { useChat } from '../hooks/useChat';
import { useAnnotations } from '../hooks/useAnnotations';
import { useWaitingRoom } from '../hooks/useWaitingRoom';
import { useWhiteboard } from '../hooks/useWhiteboard';
import { uploadSharedFile } from '../lib/upload';
import { Stage, type AnnotationState, type WhiteboardState } from './room/Stage';
import { TopBar } from './room/TopBar';
import { Toolbar } from './room/Toolbar';
import { SidePanel } from './room/SidePanel';
import { InviteDialog } from './room/InviteDialog';

// Chrome/Edge can publish tab or system audio with a screen share; Safari/Firefox cannot.
const canCaptureScreenAudio = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);

const roomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // Speech, mono, with AGC: keeps voices intelligible and level-consistent on
  // weak uplinks. voiceIsolation can over-suppress quiet/far-field speech.
  audioCaptureDefaults: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    voiceIsolation: false,
    channelCount: 1,
  },
  videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
  publishDefaults: {
    audioPreset: AudioPresets.speech,
    dtx: true,
    red: true,
    forceStereo: false,
    simulcast: true,
    // Lower ceilings leave headroom for audio when the link is saturated.
    videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 24 },
    screenShareEncoding: { maxBitrate: 1_500_000, maxFramerate: 15 },
  },
};

type MeetingRoomProps = {
  meeting: MeetingInfo;
  session: Session;
  isHost: boolean;
  hostKey: string;
  passcode: string;
  created: boolean;
  onLeave: () => void;
  onDisconnected: () => void;
};

export function MeetingRoom({
  meeting,
  session,
  isHost,
  hostKey,
  passcode,
  created,
  onLeave,
  onDisconnected,
}: MeetingRoomProps) {
  const [connectionError, setConnectionError] = useState('');

  return (
    <div className="h-full">
      <LiveKitRoom
        token={session.token}
        serverUrl={session.serverUrl}
        connect
        audio={session.micOn}
        video={session.camOn}
        options={roomOptions}
        className="h-full"
        style={{ height: '100%' }}
        onError={(error) => setConnectionError(error.message)}
        onDisconnected={onDisconnected}
      >
        <RoomAudioRenderer />
        <RoomView
          meeting={meeting}
          token={session.token}
          isHost={isHost}
          hostKey={hostKey}
          passcode={passcode}
          created={created}
          connectionError={connectionError}
          onLeave={onLeave}
        />
      </LiveKitRoom>
    </div>
  );
}

function RoomView({
  meeting,
  token,
  isHost,
  hostKey,
  passcode,
  created,
  connectionError,
  onLeave,
}: {
  meeting: MeetingInfo;
  token: string;
  isHost: boolean;
  hostKey: string;
  passcode: string;
  created: boolean;
  connectionError: string;
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const screenTrack =
    screenTracks.find((trackRef): trackRef is TrackReference => isTrackReference(trackRef)) ?? null;
  const sharing = screenTracks.some((trackRef) => trackRef.participant.isLocal);
  const shareWithSound = useTracks([Track.Source.ScreenShareAudio], {
    onlySubscribed: false,
  }).some((trackRef) => isTrackReference(trackRef));

  const micOn = isMicEnabled(localParticipant);
  const camOn = isCameraEnabled(localParticipant);

  const { messages, send } = useChat();
  const annotations = useAnnotations();
  const whiteboard = useWhiteboard();
  const { requests, decide, offline } = useWaitingRoom(meeting.id, hostKey, isHost);

  const [panel, setPanel] = useState<Panel | null>(null);
  const [mode, setMode] = useState<ViewMode>('gallery');
  const [inviteOpen, setInviteOpen] = useState(created);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const seenMessages = useRef(0);
  useEffect(() => {
    const added = messages.length - seenMessages.current;
    seenMessages.current = messages.length;
    if (panel !== 'chat' && added > 0) setUnread((current) => current + added);
  }, [messages.length, panel]);

  useEffect(() => {
    if (panel === 'chat') setUnread(0);
  }, [panel]);

  const seenWaiting = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isHost) return;
    const fresh = requests.filter((request) => !seenWaiting.current.has(request.id));
    seenWaiting.current = new Set(requests.map((request) => request.id));
    if (fresh.length > 0) showToast(`${fresh[0].name} is waiting to join`);
  }, [requests, isHost, showToast]);

  const openPanel = useCallback((next: Panel) => {
    setPanel((current) => (current === next ? null : next));
  }, []);

  const handleMic = useCallback(() => {
    void localParticipant.setMicrophoneEnabled(!micOn).catch(() => showToast('Microphone is unavailable'));
  }, [localParticipant, micOn, showToast]);

  const handleCam = useCallback(() => {
    void localParticipant.setCameraEnabled(!camOn).catch(() => showToast('Camera is unavailable'));
  }, [localParticipant, camOn, showToast]);

  const handleShare = useCallback(async () => {
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      showToast('This browser cannot share a screen. Use a desktop browser or the Android app.');
      return;
    }
    try {
      if (sharing) {
        await localParticipant.setScreenShareEnabled(false);
        return;
      }
      if (canCaptureScreenAudio) {
        showToast('In the picker, tick "Share system audio" (or "Share tab audio") to send computer sound');
      }
      await localParticipant.setScreenShareEnabled(
        true,
        canCaptureScreenAudio
          ? {
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
              systemAudio: 'include',
              selfBrowserSurface: 'exclude',
            }
          : undefined,
        canCaptureScreenAudio ? { audioPreset: AudioPresets.music } : undefined,
      );
    } catch {
      showToast('Screen sharing was cancelled or is not permitted');
    }
  }, [localParticipant, sharing, showToast]);

  const closeWhiteboard = useCallback(() => {
    annotations.clearStrokes('whiteboard');
    whiteboard.close();
  }, [annotations.clearStrokes, whiteboard.close]);

  const handleWhiteboard = useCallback(() => {
    if (whiteboard.active) {
      closeWhiteboard();
      return;
    }
    if (sharing) {
      showToast('Stop the screen share before opening the whiteboard');
      return;
    }
    annotations.clearStrokes('whiteboard');
    whiteboard.open();
  }, [whiteboard.active, whiteboard.open, closeWhiteboard, sharing, annotations.clearStrokes, showToast]);

  const handleSend = useCallback(
    async (text: string) => {
      try {
        await send(text);
      } catch {
        showToast('Message could not be sent');
      }
    },
    [send, showToast],
  );

  const handleSendFile = useCallback(
    async (file: File, caption: string, onProgress: (fraction: number) => void) => {
      const shared = await uploadSharedFile({
        meetingId: meeting.id,
        token,
        file,
        onProgress,
      });
      await send(caption, {
        url: shared.url,
        name: shared.name,
        size: shared.size,
        type: shared.type,
      });
    },
    [meeting.id, token, send],
  );

  const handleDecide = useCallback(
    async (requestId: string, action: 'approve' | 'deny') => {
      try {
        await decide(requestId, action);
        showToast(action === 'approve' ? 'Guest admitted' : 'Request declined');
      } catch {
        showToast('Could not update the waiting room');
      }
    },
    [decide, showToast],
  );

  const handleLeave = useCallback(() => {
    onLeave();
    void room.disconnect();
  }, [onLeave, room]);

  const inviteUrl = `${window.location.origin}/m/${meeting.id}${passcode ? `#p=${encodeURIComponent(passcode)}` : ''}`;

  const shareIdentity = screenTrack?.participant.identity;
  const annotationState: AnnotationState | null = shareIdentity
    ? {
        target: shareIdentity,
        strokes: annotations.strokes[shareIdentity] ?? [],
        beginStroke: annotations.beginStroke,
        appendPoints: annotations.appendPoints,
        endStroke: annotations.endStroke,
        undoStroke: annotations.undoStroke,
        clearStrokes: annotations.clearStrokes,
      }
    : null;

  const whiteboardState: WhiteboardState | null = whiteboard.active
    ? {
        startedBy: whiteboard.startedBy,
        local: whiteboard.by === localParticipant.identity,
        strokes: annotations.strokes.whiteboard ?? [],
        beginStroke: annotations.beginStroke,
        appendPoints: annotations.appendPoints,
        endStroke: annotations.endStroke,
        undoStroke: annotations.undoStroke,
        clearStrokes: annotations.clearStrokes,
        transformStrokes: annotations.transformStrokes,
        onClose: closeWhiteboard,
      }
    : null;

  return (
    <div className="flex h-full flex-col bg-room">
      <TopBar
        title={meeting.title}
        meetingId={meeting.id}
        isHost={isHost}
        participantCount={participants.length}
        waitingCount={isHost ? requests.length : 0}
        panel={panel}
        unread={unread}
        mode={mode}
        onToggleMode={() => setMode((current) => (current === 'gallery' ? 'speaker' : 'gallery'))}
        onOpenPanel={openPanel}
        onInvite={() => setInviteOpen(true)}
        showToast={showToast}
      />

      {connectionError && connectionState !== ConnectionState.Connected && (
        <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-[11px] text-red-300">
          <AlertTriangle size={13} /> Connection problem: {connectionError}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <Stage
            cameraTracks={cameraTracks}
            screenTrack={screenTrack}
            shareWithSound={shareWithSound}
            annotations={annotationState}
            whiteboard={whiteboardState}
            mode={mode}
            onStopSharing={() => void handleShare()}
          />
        </div>

        {panel && (
          <div className="absolute inset-0 z-30 sm:static sm:z-auto sm:w-[350px] sm:shrink-0">
            <SidePanel
              panel={panel}
              unread={unread}
              waitingCount={isHost ? requests.length : 0}
              isHost={isHost}
              participants={participants}
              waiting={requests}
              waitingOffline={offline}
              messages={messages}
              inviteUrl={inviteUrl}
              passcode={passcode}
              onTab={setPanel}
              onClose={() => setPanel(null)}
              onSend={handleSend}
              onSendFile={handleSendFile}
              onDecide={(requestId, action) => void handleDecide(requestId, action)}
              onInvite={() => setInviteOpen(true)}
              showToast={showToast}
            />
          </div>
        )}
      </div>

      <Toolbar
        micOn={micOn}
        camOn={camOn}
        sharing={sharing}
        whiteboardActive={whiteboard.active}
        panel={panel}
        unread={unread}
        waitingCount={isHost ? requests.length : 0}
        onToggleMic={handleMic}
        onToggleCam={handleCam}
        onToggleShare={() => void handleShare()}
        onToggleWhiteboard={handleWhiteboard}
        onOpenPanel={openPanel}
        onInvite={() => setInviteOpen(true)}
        onLeave={handleLeave}
      />

      <InviteDialog
        open={inviteOpen}
        title={meeting.title}
        meetingId={meeting.id}
        passcode={passcode}
        onClose={() => setInviteOpen(false)}
        showToast={showToast}
      />

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-800/95 px-4 py-2 text-xs text-mist-100 shadow-xl backdrop-blur animate-fade">
          {toast}
        </div>
      )}
    </div>
  );
}