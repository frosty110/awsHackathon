import { useState } from 'react';

export interface CharacterClass {
  id: string;
  name: string;
  icon: string;
  description: string;
  hitDie: string;
  primaryAbility: string;
}

const CLASSES: CharacterClass[] = [
  {
    id: 'fighter',
    name: 'Fighter',
    icon: '⚔️',
    description: 'A master of martial combat, skilled with a variety of weapons and armor.',
    hitDie: 'd10',
    primaryAbility: 'Strength',
  },
  {
    id: 'wizard',
    name: 'Wizard',
    icon: '🔮',
    description: 'A scholarly magic-user who wields arcane power through study and intellect.',
    hitDie: 'd6',
    primaryAbility: 'Intelligence',
  },
  {
    id: 'rogue',
    name: 'Rogue',
    icon: '🗡️',
    description: 'A scoundrel who uses stealth and trickery to overcome obstacles and enemies.',
    hitDie: 'd8',
    primaryAbility: 'Dexterity',
  },
  {
    id: 'cleric',
    name: 'Cleric',
    icon: '✝️',
    description: 'A priestly champion who wields divine magic in service of a higher power.',
    hitDie: 'd8',
    primaryAbility: 'Wisdom',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    icon: '🏹',
    description: 'A warrior of the wilderness, skilled in tracking and nature magic.',
    hitDie: 'd10',
    primaryAbility: 'Dexterity',
  },
  {
    id: 'paladin',
    name: 'Paladin',
    icon: '🛡️',
    description: 'A holy warrior bound to a sacred oath, combining martial prowess with divine magic.',
    hitDie: 'd10',
    primaryAbility: 'Strength & Charisma',
  },
];

interface ClassSelectProps {
  onSelect: (characterClass: CharacterClass, pronouns: string) => void;
}

const PRONOUN_PRESETS = ['He/Him', 'She/Her', 'They/Them', 'Custom'] as const;

export function ClassSelect({ onSelect }: ClassSelectProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState<string>('They/Them');
  const [customPronouns, setCustomPronouns] = useState('');

  function handleConfirm() {
    const cls = CLASSES.find(c => c.id === selected);
    if (cls) onSelect(cls, pronouns === 'Custom' ? customPronouns.trim() || 'They/Them' : pronouns);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
      <h2
        className="font-cinzel font-bold text-3xl tracking-widest mb-2"
        style={{
          color: 'var(--color-dm-gold)',
          textShadow: '0 0 12px oklch(0.75 0.15 55 / 0.6)',
        }}
      >
        Choose Your Class
      </h2>
      <p className="font-fell text-parchment/60 text-2xl mb-8">
        Who are you, adventurer?
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-xl mb-8">
        {CLASSES.map(cls => (
          <button
            key={cls.id}
            onClick={() => setSelected(cls.id)}
            className={`
              group flex flex-col items-center gap-2 p-4 border rounded
              transition-all duration-200 cursor-pointer
              ${selected === cls.id
                ? 'border-dm-gold bg-dm-gold/10 shadow-[0_0_16px_oklch(0.75_0.15_55_/_0.3)]'
                : 'border-blood/30 bg-surface hover:border-blood-light hover:bg-blood/10'
              }
            `}
          >
            <span className="text-3xl">{cls.icon}</span>
            <span
              className={`font-cinzel font-semibold text-base tracking-wide ${
                selected === cls.id ? 'text-dm-gold' : 'text-parchment'
              }`}
            >
              {cls.name}
            </span>
          </button>
        ))}
      </div>

      {/* Detail panel for selected class */}
      {selected && (
        <div className="w-full max-w-xl border border-blood/30 bg-surface rounded p-5 mb-6 animate-[dice-reveal_0.3s_ease-out_forwards]">
          {(() => {
            const cls = CLASSES.find(c => c.id === selected)!;
            return (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{cls.icon}</span>
                  <span className="font-cinzel font-bold text-xl text-dm-gold">
                    {cls.name}
                  </span>
                </div>
                <p className="font-fell text-parchment/80 text-base mb-3">
                  {cls.description}
                </p>
                <div className="flex gap-6 text-sm text-parchment/60 font-cinzel">
                  <span>Hit Die: <span className="text-blood-light">{cls.hitDie}</span></span>
                  <span>Primary: <span className="text-blood-light">{cls.primaryAbility}</span></span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Pronoun picker */}
      {selected && (
        <div className="w-full max-w-xl mb-6">
          <label className="font-cinzel text-xs text-parchment/60 tracking-widest uppercase block mb-2">
            Pronouns
          </label>
          <div className="flex gap-2 flex-wrap">
            {PRONOUN_PRESETS.map(preset => (
              <button
                key={preset}
                onClick={() => setPronouns(preset)}
                className={`
                  px-4 py-2 border rounded font-cinzel text-sm tracking-wide
                  transition-all duration-150 cursor-pointer
                  ${pronouns === preset
                    ? 'border-dm-gold bg-dm-gold/10 text-dm-gold'
                    : 'border-blood/30 bg-surface text-parchment hover:border-blood-light'
                  }
                `}
              >
                {preset}
              </button>
            ))}
          </div>
          {pronouns === 'Custom' && (
            <input
              type="text"
              value={customPronouns}
              onChange={e => setCustomPronouns(e.target.value.slice(0, 20))}
              placeholder="e.g. Ze/Zir"
              maxLength={20}
              className="
                mt-2 w-full bg-surface border border-blood/30 rounded px-3 py-2
                font-fell text-parchment placeholder:text-parchment/50
                focus:border-dm-gold/50
              "
            />
          )}
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={!selected}
        className="font-cinzel text-xl text-parchment px-8 py-4 border border-blood bg-blood/20 hover:bg-blood/40 tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Begin Adventure
      </button>
    </div>
  );
}
