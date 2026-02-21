// Character class identifiers for multiplayer D&D
export type CharacterClassId =
  | 'fighter'
  | 'wizard'
  | 'rogue'
  | 'cleric'
  | 'ranger'
  | 'paladin';

export interface CharacterClassDef {
  id: CharacterClassId;
  name: string;
  icon: string;         // emoji
  color: string;        // Tailwind text color class
}

// 6 playable classes with class-based identity colors
export const CHARACTER_CLASSES: CharacterClassDef[] = [
  { id: 'fighter', name: 'Fighter', icon: '⚔️',  color: 'text-red-400'    },
  { id: 'wizard',  name: 'Wizard',  icon: '🔮',  color: 'text-blue-400'   },
  { id: 'rogue',   name: 'Rogue',   icon: '🗡️',  color: 'text-purple-400' },
  { id: 'cleric',  name: 'Cleric',  icon: '✝️',  color: 'text-yellow-300' },
  { id: 'ranger',  name: 'Ranger',  icon: '🏹',  color: 'text-green-400'  },
  { id: 'paladin', name: 'Paladin', icon: '🛡️',  color: 'text-pink-400'   },
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
  type?: 'chat' | 'action';
}

// 16 fantasy-flavored default display names, randomly assigned to new players
export const DEFAULT_DISPLAY_NAMES = [
  'Shadowmere',
  'Thornwick',
  'Grimjaw',
  'Ashveil',
  'Duskhollow',
  'Ironbark',
  'Stormvane',
  'Cinderfell',
  'Wraithbloom',
  'Frostmane',
  'Emberclaw',
  'Nightthorn',
  'Bonewarden',
  'Hexmoor',
  'Gloomspire',
  'Ravenshade',
] as const;

// Pick a random default display name
export function randomDisplayName(): string {
  return DEFAULT_DISPLAY_NAMES[Math.floor(Math.random() * DEFAULT_DISPLAY_NAMES.length)];
}

// Pick a random character class
export function randomCharacterClass(): CharacterClassId {
  return CHARACTER_CLASSES[Math.floor(Math.random() * CHARACTER_CLASSES.length)].id;
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

// Helper: return a Tailwind border color class for a given character class
export function getClassBorderColor(classId: CharacterClassId): string {
  const map: Record<CharacterClassId, string> = {
    fighter: 'border-red-400',
    wizard: 'border-blue-400',
    rogue: 'border-purple-400',
    cleric: 'border-yellow-300',
    ranger: 'border-green-400',
    paladin: 'border-pink-400',
  };
  return map[classId] ?? 'border-parchment/40';
}

// Helper: return a subtle Tailwind bg class for a given character class
export function getClassBgColor(classId: CharacterClassId): string {
  const map: Record<CharacterClassId, string> = {
    fighter: 'bg-red-400/10',
    wizard: 'bg-blue-400/10',
    rogue: 'bg-purple-400/10',
    cleric: 'bg-yellow-300/10',
    ranger: 'bg-green-400/10',
    paladin: 'bg-pink-400/10',
  };
  return map[classId] ?? 'bg-parchment/5';
}
