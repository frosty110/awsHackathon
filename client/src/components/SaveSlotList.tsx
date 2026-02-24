import { useState, useEffect, useRef } from 'react';
import { listSaves, deleteSave, renameSave } from '../services/saves';
import type { SaveRecord } from '../services/saves';

interface SaveSlotListProps {
  onResume: (save: SaveRecord) => void;
  onBack: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function SaveSlotList({ onResume, onBack }: SaveSlotListProps) {
  const [saves, setSaves] = useState<SaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSaves();
  }, []);

  // Focus rename input when editing starts
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  async function loadSaves() {
    setLoading(true);
    const data = await listSaves();
    setSaves(data);
    setLoading(false);
  }

  async function handleDelete(save: SaveRecord) {
    if (!window.confirm(`Delete "${save.name}"? This cannot be undone.`)) return;
    const ok = await deleteSave(save.conversationId);
    if (ok) {
      setSaves(prev => prev.filter(s => s.conversationId !== save.conversationId));
    }
  }

  function startRename(save: SaveRecord) {
    setRenamingId(save.conversationId);
    setRenameValue(save.name);
  }

  async function commitRename(save: SaveRecord) {
    const trimmed = renameValue.trim().slice(0, 50);
    if (trimmed && trimmed !== save.name) {
      const ok = await renameSave(save.conversationId, trimmed);
      if (ok) {
        setSaves(prev => prev.map(s =>
          s.conversationId === save.conversationId ? { ...s, name: trimmed } : s
        ));
      }
    }
    setRenamingId(null);
    setRenameValue('');
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, save: SaveRecord) {
    if (e.key === 'Enter') void commitRename(save);
    if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start px-6 py-8 overflow-y-auto">
      <h2
        className="font-cinzel font-bold text-3xl tracking-widest mb-2"
        style={{
          color: 'var(--color-dm-gold)',
          textShadow: '0 0 12px oklch(0.75 0.15 55 / 0.6)',
        }}
      >
        Saved Adventures
      </h2>
      <p className="font-fell text-parchment/60 text-2xl mb-8">
        Your chronicles await
      </p>

      {loading ? (
        <div className="flex items-center gap-3 text-parchment/60 font-fell text-xl mt-8">
          <span className="animate-spin text-2xl">⏳</span>
          Loading your adventures...
        </div>
      ) : saves.length === 0 ? (
        <div className="w-full max-w-xl border border-blood/30 bg-surface rounded p-8 text-center mt-4">
          <p className="text-5xl mb-4">📜</p>
          <p className="font-fell text-parchment/70 text-xl">
            No saved adventures yet.
          </p>
          <p className="font-fell text-parchment/50 text-lg mt-2">
            Start a new adventure and save your progress!
          </p>
        </div>
      ) : (
        <div className="w-full max-w-xl flex flex-col gap-4">
          {saves.map(save => (
            <div
              key={save.conversationId}
              className="border border-blood/30 bg-surface rounded p-4 hover:border-dm-gold/50 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                {/* Save name — click to rename */}
                {renamingId === save.conversationId ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value.slice(0, 50))}
                    onBlur={() => void commitRename(save)}
                    onKeyDown={e => handleRenameKeyDown(e, save)}
                    maxLength={50}
                    className="
                      flex-1 bg-surface border border-dm-gold/50 rounded px-2 py-1
                      font-cinzel text-lg text-dm-gold
                      focus:outline-none focus:border-dm-gold
                    "
                  />
                ) : (
                  <button
                    onClick={() => startRename(save)}
                    className="flex-1 text-left font-cinzel text-lg text-parchment hover:text-dm-gold transition-colors"
                    title="Click to rename"
                  >
                    {save.name}
                  </button>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onResume(save)}
                    className="
                      font-cinzel text-sm px-3 py-1.5 border rounded
                      border-dm-gold/50 text-dm-gold
                      hover:bg-dm-gold/10 hover:border-dm-gold
                      transition-all duration-150
                    "
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => void handleDelete(save)}
                    className="
                      font-cinzel text-sm px-3 py-1.5 border rounded
                      border-blood/40 text-blood-light
                      hover:bg-blood/10 hover:border-blood-light
                      transition-all duration-150
                    "
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Save metadata */}
              <div className="flex flex-wrap gap-4 text-sm text-parchment/60 font-fell">
                {save.characterClass && (
                  <span>
                    Class: <span className="text-parchment/80">{save.characterClass}</span>
                    {save.pronouns && <span className="text-parchment/50"> ({save.pronouns})</span>}
                  </span>
                )}
                <span>
                  Turns: <span className="text-parchment/80">{save.turnCount}</span>
                </span>
                <span title={new Date(save.lastPlayedAt).toLocaleString()}>
                  Last played:{' '}
                  <span className="text-parchment/80">
                    {new Date(save.lastPlayedAt).toLocaleDateString()} &middot; {formatRelativeTime(save.lastPlayedAt)}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Back button */}
      <div className="mt-8 w-full max-w-xl">
        <button
          onClick={onBack}
          className="
            font-cinzel text-sm text-parchment/60 hover:text-parchment
            border border-parchment/20 hover:border-parchment/40
            px-6 py-2 rounded transition-all duration-150
          "
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
