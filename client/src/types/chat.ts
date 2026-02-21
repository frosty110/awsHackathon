export type MessageRole = 'dm' | 'player' | 'dice';

export interface Message {
  id: string;          // crypto.randomUUID() — available in modern browsers (desktop-only)
  role: MessageRole;
  content: string;
  isStreaming?: boolean; // true while token chunks still arriving (Phase 4 SSE indicator)
}

export type AppState = 'idle' | 'classSelect' | 'adventure' | 'modeSelect' | 'multiplayerLobby' | 'multiplayerGame';
