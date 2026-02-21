import type { MultiplayerPlayer } from '../types/multiplayer';
import { getClassColor, getClassIcon } from '../types/multiplayer';

interface PlayerStatusBarProps {
  players: MultiplayerPlayer[];
  localSocketId: string;
}

export function PlayerStatusBar({ players, localSocketId }: PlayerStatusBarProps) {
  return (
    <div className="flex flex-row gap-3 overflow-x-auto px-4 py-2 bg-surface/80 border-b border-blood/30">
      {players.map(player => {
        const isLocal = player.socketId === localSocketId;
        const colorClass = getClassColor(player.characterClass);
        const icon = getClassIcon(player.characterClass);

        return (
          <div
            key={player.socketId}
            className={[
              'flex flex-col items-center gap-1 px-3 py-2 rounded bg-surface border min-w-[80px]',
              isLocal ? 'border-dm-gold/40' : 'border-blood/20',
            ].join(' ')}
            title={`${player.displayName} — ${player.characterClass}`}
          >
            {/* Class icon + name */}
            <div className="flex items-center gap-1">
              <span className="text-sm" role="img" aria-label={player.characterClass}>
                {icon}
              </span>
              <span className={`font-cinzel text-xs font-semibold truncate max-w-[56px] ${colorClass}`}>
                {player.displayName}
              </span>
            </div>

            {/* Status indicators row */}
            <div className="flex items-center gap-2">
              {/* Connection status dot */}
              <span
                className={[
                  'w-2 h-2 rounded-full',
                  player.connected ? 'bg-green-500' : 'bg-gray-500',
                ].join(' ')}
                title={player.connected ? 'Connected' : 'Disconnected'}
              />

              {/* Action submission indicator */}
              {player.submittedAction ? (
                <span
                  className="text-green-400 text-xs"
                  title="Action submitted"
                >
                  ✓
                </span>
              ) : (
                <span
                  className="text-parchment/30 text-xs"
                  title="Waiting for action"
                >
                  —
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
