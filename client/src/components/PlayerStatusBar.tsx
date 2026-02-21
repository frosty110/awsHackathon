import type { MultiplayerPlayer } from '../types/multiplayer';
import { getClassColor, getClassIcon, getGenderIcon, getClassMaxHp, CHARACTER_CLASSES } from '../types/multiplayer';

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
        const classDef = CHARACTER_CLASSES.find(c => c.id === player.characterClass);
        const maxHp = getClassMaxHp(player.characterClass);
        const abilityAbbr = classDef?.primaryAbility.slice(0, 3).toUpperCase() ?? '???';
        const isIdle = player.idle && player.connected;

        return (
          <div
            key={player.socketId}
            className={[
              'flex flex-col items-center gap-1 px-3 py-2 rounded bg-surface border min-w-[100px]',
              isLocal ? 'border-dm-gold/40' : 'border-blood/20',
              isIdle ? 'opacity-60' : '',
            ].join(' ')}
            title={`${player.displayName} — ${player.characterClass}`}
          >
            {/* Row 1: Class icon + gender icon + name */}
            <div className="flex items-center gap-1">
              <span className="text-sm" role="img" aria-label={player.characterClass}>
                {icon}
              </span>
              <span className="text-xs opacity-60" title={player.gender}>
                {getGenderIcon(player.gender)}
              </span>
              <span className={`font-cinzel text-xs font-semibold truncate max-w-[64px] ${colorClass}`}>
                {player.displayName}
              </span>
            </div>

            {/* Row 2: Class name + hit die */}
            <div className="flex items-center justify-between w-full px-1">
              <span className="font-cinzel text-[10px] text-parchment/60">
                {classDef?.name ?? player.characterClass}
              </span>
              <span className="text-[10px] text-parchment/40">
                {classDef?.hitDie ?? '?'}
              </span>
            </div>

            {/* Row 3: HP + primary ability */}
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-dm-gold font-semibold">HP: {maxHp}/{maxHp}</span>
              <span className="text-parchment/30">|</span>
              <span className="text-parchment/50">{abilityAbbr}</span>
            </div>

            {/* Row 4: Connection + submission status */}
            <div className="flex items-center gap-2">
              {/* Connection status dot */}
              <span
                className={[
                  'w-2 h-2 rounded-full',
                  !player.connected ? 'bg-gray-500' : isIdle ? 'bg-amber-400' : 'bg-green-500',
                ].join(' ')}
                title={!player.connected ? 'Disconnected' : isIdle ? 'Idle' : 'Connected'}
              />

              {isIdle ? (
                <span className="text-amber-400/70 text-[10px] font-cinzel">Idle</span>
              ) : player.submittedAction ? (
                <span className="text-green-400 text-xs" title="Action submitted">
                  ✓
                </span>
              ) : (
                <span className="text-parchment/30 text-xs" title="Waiting for action">
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
