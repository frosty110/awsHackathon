import { useState, useRef, useEffect } from 'react';

interface DiceRollerProps {
  onRoll: (value: number) => void;
  disabled: boolean;
}

export function DiceRoller({ onRoll, disabled }: DiceRollerProps) {
  const [shaking, setShaking] = useState(false);
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending timeout on unmount to prevent stale onRoll calls
  useEffect(() => {
    return () => {
      if (shakeTimeout.current !== null) {
        clearTimeout(shakeTimeout.current);
      }
    };
  }, []);

  function handleClick() {
    if (disabled || shaking) return;

    setShaking(true);

    const result = Math.floor(Math.random() * 20) + 1;

    shakeTimeout.current = setTimeout(() => {
      shakeTimeout.current = null;
      setShaking(false);
      onRoll(result);
    }, 400);
  }

  return (
    <div className="px-4 pb-3">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={[
          'w-full py-2 font-cinzel text-sm text-parchment border border-blood bg-blood/30 hover:bg-blood/50 rounded',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          shaking ? 'animate-dice-shake' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        🎲 Roll the Dice
      </button>
    </div>
  );
}
