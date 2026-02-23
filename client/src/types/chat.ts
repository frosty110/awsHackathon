export type MessageRole = 'dm' | 'player' | 'dice';

export interface Message {
  id: string;          // crypto.randomUUID() — available in modern browsers (desktop-only)
  role: MessageRole;
  content: string;
  isStreaming?: boolean; // true while token chunks still arriving (Phase 4 SSE indicator)
  audioUrl?: string;   // blob URL for TTS audio — kept alive for replay
}

export type AppState = 'login' | 'idle' | 'classSelect' | 'adventure' | 'modeSelect' | 'multiplayerLobby' | 'multiplayerGame';
