import { describe, it, expect } from 'vitest';
import { DM_SYSTEM_PROMPT, buildMultiplayerSystemPrompt } from '../../services/promptBuilder.js';

describe('DM_SYSTEM_PROMPT', () => {
  it('contains the adventure name', () => {
    expect(DM_SYSTEM_PROMPT).toContain('Ring of Ashwick');
  });

  it('contains dice roll brackets', () => {
    expect(DM_SYSTEM_PROMPT).toContain('1–5');
    expect(DM_SYSTEM_PROMPT).toContain('16–19');
    expect(DM_SYSTEM_PROMPT).toContain('20: CRITICAL');
  });

  it('contains mood tag instructions', () => {
    expect(DM_SYSTEM_PROMPT).toContain('{{mood:combat}}');
    expect(DM_SYSTEM_PROMPT).toContain('{{mood:tavern}}');
  });

  it('contains voice tag instructions', () => {
    expect(DM_SYSTEM_PROMPT).toContain('{{voice:barkeep}}');
    expect(DM_SYSTEM_PROMPT).toContain('{{/voice}}');
  });

  it('is a non-empty string', () => {
    expect(typeof DM_SYSTEM_PROMPT).toBe('string');
    expect(DM_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});

describe('buildMultiplayerSystemPrompt', () => {
  it('includes base DM prompt', () => {
    const result = buildMultiplayerSystemPrompt([
      { displayName: 'Alice', characterClass: 'Warrior' },
    ]);
    expect(result).toContain('Ring of Ashwick');
  });

  it('includes party roster with class', () => {
    const result = buildMultiplayerSystemPrompt([
      { displayName: 'Alice', characterClass: 'Warrior', pronouns: 'She/Her' },
      { displayName: 'Bob', characterClass: 'Mage', pronouns: 'He/Him' },
    ]);
    expect(result).toContain('Alice: Warrior');
    expect(result).toContain('Bob: Mage');
    expect(result).toContain('She/Her');
    expect(result).toContain('He/Him');
  });

  it('defaults to They/Them when no pronouns provided', () => {
    const result = buildMultiplayerSystemPrompt([
      { displayName: 'Charlie', characterClass: 'Rogue' },
    ]);
    expect(result).toContain('They/Them');
  });

  it('includes multiplayer session instructions', () => {
    const result = buildMultiplayerSystemPrompt([
      { displayName: 'Alice', characterClass: 'Warrior' },
    ]);
    expect(result).toContain('multiplayer session');
    expect(result).toContain('ONE cohesive narrative');
  });

  it('includes ALL players when roster has multiple members', () => {
    const result = buildMultiplayerSystemPrompt([
      { displayName: 'Alpha', characterClass: 'Warrior' },
      { displayName: 'Beta', characterClass: 'Mage' },
      { displayName: 'Gamma', characterClass: 'Cleric' },
    ]);
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
    expect(result).toContain('Gamma');
  });

  it('appends content after base DM prompt', () => {
    const base = DM_SYSTEM_PROMPT;
    const result = buildMultiplayerSystemPrompt([
      { displayName: 'Alice', characterClass: 'Warrior' },
    ]);
    expect(result.length).toBeGreaterThan(base.length);
    expect(result.startsWith(base)).toBe(true);
  });
});
