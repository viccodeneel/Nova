export type LiveKitVoicePhase = 'checking' | 'disabled' | 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';
export type LiveKitVoiceEvent = 'READY' | 'DISABLED' | 'CONNECT' | 'CONNECTED' | 'SPEAKING' | 'LISTENING' | 'DISCONNECT' | 'FAILED';

export function transitionLiveKitVoice(current: LiveKitVoicePhase, event: LiveKitVoiceEvent): LiveKitVoicePhase {
  switch (event) {
    case 'READY': return current === 'checking' || current === 'disabled' ? 'idle' : current;
    case 'DISABLED': return 'disabled';
    case 'CONNECT': return current === 'idle' || current === 'error' ? 'connecting' : current;
    case 'CONNECTED': return current === 'connecting' ? 'listening' : current;
    case 'SPEAKING': return current === 'listening' || current === 'speaking' ? 'speaking' : current;
    case 'LISTENING': return current === 'speaking' || current === 'listening' ? 'listening' : current;
    case 'DISCONNECT': return current === 'disabled' || current === 'checking' ? current : 'idle';
    case 'FAILED': return 'error';
  }
}

