// Gender identifiers for character creation
export type GenderId = 'male' | 'female' | 'nonbinary';

export interface GenderDef {
  id: GenderId;
  name: string;
  icon: string;
}

export const GENDERS: GenderDef[] = [
  { id: 'male', name: 'Male', icon: '\u2642\uFE0F' },
  { id: 'female', name: 'Female', icon: '\u2640\uFE0F' },
  { id: 'nonbinary', name: 'Non-binary', icon: '\u26A7\uFE0F' },
];

// Pick a random gender
export function randomGender(): GenderId {
  return GENDERS[Math.floor(Math.random() * GENDERS.length)].id;
}

// Helper: return the emoji icon for a given gender
export function getGenderIcon(genderId: GenderId): string {
  const def = GENDERS.find(g => g.id === genderId);
  return def?.icon ?? '?';
}

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
  description: string;
  hitDie: string;       // e.g. 'd10'
  primaryAbility: string;
}

// 6 playable classes with class-based identity colors
export const CHARACTER_CLASSES: CharacterClassDef[] = [
  { id: 'fighter', name: 'Fighter', icon: '⚔️',  color: 'text-red-400',    description: 'A master of martial combat', hitDie: 'd10', primaryAbility: 'Strength' },
  { id: 'wizard',  name: 'Wizard',  icon: '🔮',  color: 'text-blue-400',   description: 'A scholarly magic-user',     hitDie: 'd6',  primaryAbility: 'Intelligence' },
  { id: 'rogue',   name: 'Rogue',   icon: '🗡️',  color: 'text-purple-400', description: 'A scoundrel with stealth',   hitDie: 'd8',  primaryAbility: 'Dexterity' },
  { id: 'cleric',  name: 'Cleric',  icon: '✝️',  color: 'text-yellow-300', description: 'A priestly champion',        hitDie: 'd8',  primaryAbility: 'Wisdom' },
  { id: 'ranger',  name: 'Ranger',  icon: '🏹',  color: 'text-green-400',  description: 'A warrior of the wilderness', hitDie: 'd10', primaryAbility: 'Dexterity' },
  { id: 'paladin', name: 'Paladin', icon: '🛡️',  color: 'text-pink-400',   description: 'A holy warrior',             hitDie: 'd10', primaryAbility: 'Charisma' },
];

// Room lifecycle phases — mirrors server-side RoomPhase
export type RoomPhase = 'lobby' | 'playing' | 'collecting-actions' | 'dm-responding';

// Represents one player in a multiplayer room
export interface MultiplayerPlayer {
  socketId: string;
  displayName: string;
  characterClass: CharacterClassId;
  gender: GenderId;
  pronouns?: string;
  connected: boolean;
  ready: boolean;
  submittedAction: boolean;
  idle: boolean;
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
  fromGender?: GenderId;
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

// Helper: return the numeric max HP for a class (max of hit die)
export function getClassMaxHp(classId: CharacterClassId): number {
  const def = CHARACTER_CLASSES.find(c => c.id === classId);
  if (!def) return 8;
  return parseInt(def.hitDie.slice(1), 10); // 'd10' -> 10
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
