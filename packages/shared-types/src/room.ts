/** Room lifecycle phases for multiplayer games. */
export type RoomPhase = "lobby" | "playing" | "collecting-actions" | "dm-responding";

/** Serialized player data sent over the wire (action text is hidden). */
export type PlayerPayload = {
  socketId: string;
  displayName: string;
  characterClass: string;
  gender: string;
  pronouns?: string;
  connected: boolean;
  ready: boolean;
  submittedAction: boolean;
  idle: boolean;
};

/** Full snapshot of a room sent by the server. */
export type RoomStatePayload = {
  code: string;
  phase: RoomPhase;
  players: PlayerPayload[];
};

/** A message in the player-to-player side chat (not visible to the DM AI). */
export type ChatMessagePayload = {
  id: string;
  fromSocketId: string;
  fromName: string;
  fromClass: string;
  fromGender?: string;
  fromPronouns?: string;
  text: string;
  timestamp: number;
};
