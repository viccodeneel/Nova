import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, RemoteTrack, Room } from 'livekit-client';
import type { NavSection } from '../data/terminalData.ts';
import { ApiClient } from '../services/apiClient.ts';
import { transitionLiveKitVoice, type LiveKitVoiceEvent, type LiveKitVoicePhase } from './livekitState.ts';

interface Options {
  authenticated: boolean;
  accountId?: string;
  onConnecting: () => void;
  onDisconnected: () => void;
  onNavigate: (page: NavSection) => Promise<void>;
}

const activePhases: LiveKitVoicePhase[] = ['connecting', 'listening', 'speaking'];

function removeRemoteAudio(room: Room) {
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      const track = publication.track;
      if (track?.kind === 'audio') track.detach().forEach((element) => element.remove());
    }
  }
}

function voiceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'BROWSER_UNSUPPORTED') {
    return 'This browser does not support the WebRTC features required for LiveKit voice. Try a current desktop or mobile browser.';
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was denied. Allow microphone access for NOVA, then reconnect.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone is available. Connect or enable one, then try again.';
  }
  return 'Could not connect to LiveKit. Check the NOVA server configuration, network, and deployed agent.';
}

const navigationPages: NavSection[] = ['overview', 'trade-journal', 'analytics', 'accounts', 'ai', 'finance', 'settings'];

export function useLiveKitVoice({ authenticated, accountId, onConnecting, onDisconnected, onNavigate }: Options) {
  const [phase, setPhase] = useState<LiveKitVoicePhase>('checking');
  const [message, setMessage] = useState('Checking LiveKit voice availability…');
  const [error, setError] = useState('');
  const [audioNeedsActivation, setAudioNeedsActivation] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const phaseRef = useRef<LiveKitVoicePhase>('checking');
  const generationRef = useRef(0);
  const callbacksRef = useRef({ onConnecting, onDisconnected, onNavigate });
  callbacksRef.current = { onConnecting, onDisconnected, onNavigate };

  const move = useCallback((event: LiveKitVoiceEvent) => {
    const next = transitionLiveKitVoice(phaseRef.current, event);
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const disconnect = useCallback(async () => {
    generationRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      removeRemoteAudio(room);
      await room.disconnect().catch(() => undefined);
    }
    setError('');
    setAudioNeedsActivation(false);
    move('DISCONNECT');
    callbacksRef.current.onDisconnected();
  }, [move]);

  useEffect(() => {
    let cancelled = false;
    if (!authenticated) {
      setMessage('Sign in to NOVA to use LiveKit voice.');
      move('DISABLED');
      void disconnect();
      return () => { cancelled = true; };
    }
    setMessage('Checking LiveKit voice availability…');
    setPhase('checking');
    phaseRef.current = 'checking';
    void ApiClient.getLiveKitVoiceStatus().then((status) => {
      if (cancelled) return;
      setMessage(status.message);
      if (status.ready) move('READY');
      else move('DISABLED');
    }).catch(() => {
      if (cancelled) return;
      setMessage('Could not check LiveKit availability. Browser voice remains available.');
      move('DISABLED');
    });
    return () => { cancelled = true; };
  }, [authenticated, disconnect, move]);

  const connect = useCallback(async () => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'error') return;
    if (!authenticated) { setMessage('Sign in to NOVA to use LiveKit voice.'); move('DISABLED'); return; }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not provide microphone access required for LiveKit voice.');
      move('FAILED');
      return;
    }

    callbacksRef.current.onConnecting();
    setError('');
    move('CONNECT');
    const generation = ++generationRef.current;
    let room: Room | null = null;
    try {
      const { Room: LiveKitRoom, RoomEvent, Track, ParticipantKind, isBrowserSupported } = await import('livekit-client');
      if (!isBrowserSupported()) throw new Error('BROWSER_UNSUPPORTED');
      const credentials = await ApiClient.getLiveKitVoiceToken(accountId);
      if (generation !== generationRef.current) return;
      const connectedRoom = new LiveKitRoom({ adaptiveStream: true });
      room = connectedRoom;
      roomRef.current = connectedRoom;

      connectedRoom.registerRpcMethod('nova.navigate', async ({ callerIdentity, payload }) => {
        const caller = connectedRoom.remoteParticipants.get(callerIdentity);
        if (!caller || caller.kind !== ParticipantKind.AGENT) throw new Error('Only the NOVA voice agent may request dashboard navigation.');
        let request: { page?: unknown };
        try { request = JSON.parse(payload) as { page?: unknown }; }
        catch { throw new Error('Invalid navigation request.'); }
        if (typeof request.page !== 'string' || !navigationPages.includes(request.page as NavSection)) throw new Error('That dashboard page is not available.');
        await callbacksRef.current.onNavigate(request.page as NavSection);
        return JSON.stringify({ success: true, page: request.page });
      });

      connectedRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.setAttribute('aria-hidden', 'true');
        element.style.display = 'none';
        document.body.appendChild(element);
      });
      connectedRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) track.detach().forEach((element) => element.remove());
      });
      connectedRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const agentSpeaking = speakers.some((participant) => participant.identity !== connectedRoom.localParticipant.identity);
        if (agentSpeaking) move('SPEAKING');
        else move('LISTENING');
      });
      connectedRoom.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== connectedRoom) return;
        roomRef.current = null;
        removeRemoteAudio(connectedRoom);
        setError('LiveKit disconnected. Reconnect when you are ready.');
        move('FAILED');
        callbacksRef.current.onDisconnected();
      });
      connectedRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioNeedsActivation(!connectedRoom.canPlaybackAudio);
      });

      await connectedRoom.connect(credentials.serverUrl, credentials.participantToken);
      if (generation !== generationRef.current || roomRef.current !== connectedRoom) {
        removeRemoteAudio(connectedRoom);
        await connectedRoom.disconnect();
        return;
      }
      await connectedRoom.localParticipant.setMicrophoneEnabled(true);
      if (generation !== generationRef.current || roomRef.current !== connectedRoom) {
        removeRemoteAudio(connectedRoom);
        await connectedRoom.disconnect();
        return;
      }
      setMessage('Room connected. Starting the NOVA dashboard agent…');
      await ApiClient.startLiveKitVoiceAgent(credentials.roomName, connectedRoom.localParticipant.identity);
      if (generation !== generationRef.current || roomRef.current !== connectedRoom) return;
      const agentAlreadyPresent = [...connectedRoom.remoteParticipants.values()].some((participant) => participant.kind === ParticipantKind.AGENT);
      if (!agentAlreadyPresent) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => { cleanup(); reject(new Error('NOVA_AGENT_TIMEOUT')); }, 20000);
          const onParticipant = (participant: Participant) => {
            if (participant.kind === ParticipantKind.AGENT) { cleanup(); resolve(); }
          };
          const onDisconnected = () => { cleanup(); reject(new Error('NOVA_AGENT_DISCONNECTED')); };
          const cleanup = () => {
            window.clearTimeout(timeout);
            connectedRoom.off(RoomEvent.ParticipantConnected, onParticipant);
            connectedRoom.off(RoomEvent.Disconnected, onDisconnected);
          };
          connectedRoom.on(RoomEvent.ParticipantConnected, onParticipant);
          connectedRoom.on(RoomEvent.Disconnected, onDisconnected);
        });
      }
      if (generation !== generationRef.current || roomRef.current !== connectedRoom) return;
      setAudioNeedsActivation(!connectedRoom.canPlaybackAudio);
      move('CONNECTED');
      setMessage('Connected to NOVA LiveKit voice. Tap Disconnect to end the session.');
    } catch (cause) {
      if (room && roomRef.current === room) {
        roomRef.current = null;
        removeRemoteAudio(room);
        await room.disconnect().catch(() => undefined);
  }
      if (generation === generationRef.current) {
        setError(voiceErrorMessage(cause));
        setMessage('LiveKit voice is disconnected. Browser voice remains available.');
        move('FAILED');
        callbacksRef.current.onDisconnected();
      }
    }
  }, [accountId, authenticated, move]);

  const enableAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioNeedsActivation(!room.canPlaybackAudio);
    } catch {
      setAudioNeedsActivation(true);
    }
  }, []);

  useEffect(() => () => {
    generationRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      removeRemoteAudio(room);
      void room.disconnect().catch(() => undefined);
    }
  }, []);

  return {
    phase,
    message,
    error,
    audioNeedsActivation,
    active: activePhases.includes(phase),
    available: phase !== 'disabled' && phase !== 'checking',
    connect,
    disconnect,
    enableAudio,
  };
}

export type LiveKitVoice = ReturnType<typeof useLiveKitVoice>;
