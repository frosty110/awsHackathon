interface ModeSelectProps {
  onSinglePlayer: () => void;
  onMultiplayer: () => void;
}

export function ModeSelect({ onSinglePlayer, onMultiplayer }: ModeSelectProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
      <h2
        className="font-cinzel font-bold text-3xl tracking-widest mb-2"
        style={{
          color: 'var(--color-dm-gold)',
          textShadow: '0 0 12px oklch(0.75 0.15 55 / 0.6)',
        }}
      >
        Choose Your Path
      </h2>
      <p className="font-fell text-parchment/60 text-sm mb-10">
        How will you face the darkness?
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-xl">
        {/* Solo Adventure */}
        <button
          onClick={onSinglePlayer}
          className="
            group flex flex-col items-center gap-4 p-8 border rounded
            border-blood/30 bg-surface
            hover:border-dm-gold/50 hover:bg-dm-gold/5
            transition-all duration-200 cursor-pointer
          "
        >
          <span className="text-5xl" aria-hidden="true">⚔️</span>
          <div className="text-center">
            <p className="font-cinzel font-bold text-xl text-parchment tracking-wide mb-1">
              Solo Adventure
            </p>
            <p className="font-fell text-parchment/50 text-sm">
              Face the darkness alone
            </p>
          </div>
        </button>

        {/* Multiplayer Party */}
        <button
          onClick={onMultiplayer}
          className="
            group flex flex-col items-center gap-4 p-8 border rounded
            border-blood/30 bg-surface
            hover:border-dm-gold/50 hover:bg-dm-gold/5
            transition-all duration-200 cursor-pointer
          "
        >
          <span className="text-5xl" aria-hidden="true">👥🎭</span>
          <div className="text-center">
            <p className="font-cinzel font-bold text-xl text-parchment tracking-wide mb-1">
              Multiplayer Party
            </p>
            <p className="font-fell text-parchment/50 text-sm">
              Join forces with fellow adventurers
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
