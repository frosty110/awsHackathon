// Character class identifiers for multiplayer D&D
export type CharacterClassId =
  | 'warrior'
  | 'mage'
  | 'rogue'
  | 'cleric'
  | 'ranger'
  | 'bard';

export interface CharacterClassDef {
  id: CharacterClassId;
  name: string;
  icon: string;         // emoji
  color: string;        // Tailwind text color class
}

// 6 playable classes with class-based identity colors
export const CHARACTER_CLASSES: CharacterClassDef[] = [
  { id: 'warrior', name: 'Warrior', icon: '⚔️',  color: 'text-red-400'    },
  { id: 'mage',    name: 'Mage',    icon: '✨',  color: 'text-blue-400'   },
  { id: 'rogue',   name: 'Rogue',   icon: '🗡️',  color: 'text-purple-400' },
  { id: 'cleric',  name: 'Cleric',  icon: '⭐',  color: 'text-yellow-300' },
  { id: 'ranger',  name: 'Ranger',  icon: '🏹',  color: 'text-green-400'  },
  { id: 'bard',    name: 'Bard',    icon: '🎵',  color: 'text-pink-400'   },
];

// Room lifecycle phases — mirrors server-side RoomPhase
export type RoomPhase = 'lobby' | 'playing' | 'collecting-actions' | 'dm-responding';

// Represents one player in a multiplayer room
export interface MultiplayerPlayer {
  socketId: string;
  displayName: string;
  characterClass: CharacterClassId;
  connected: boolean;
  ready: boolean;
  submittedAction: boolean;
}

// Full snapshot of a room sent by the server
export interface RoomState {
  code: string;
  phase: RoomPhase;
  players: MultiplayerPlayer[];
}

// A message in the player-to-player side chat (not visible to the DM AI)
export interface ChatMessage {
  id: string;
  fromSocketId: string;
  fromName: string;
  fromClass: CharacterClassId;
  text: string;
  timestamp: number;
}

// Helper: return the Tailwind color class for a given character class
export function getClassColor(classId: CharacterClassId): string {
  const def = CHARACTER_CLASSES.find(c => c.id === classId);
  return def?.color ?? 'text-parchment';
}

// Helper: return the emoji icon for a given character class
export function getClassIcon(classId: CharacterClassId): string {
  const def = CHARACTER_CLASSES.find(c => c.id === classId);
  return def?.icon ?? '?';
}
