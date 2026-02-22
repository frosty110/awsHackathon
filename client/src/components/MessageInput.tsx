import { useState } from 'react';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('');

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }

  return (
    <div className="flex gap-2 px-4 py-3">
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        maxLength={500}
        placeholder="What do you do?"
        className="flex-1 px-3 py-2 rounded bg-surface text-parchment font-sans text-base border border-blood/30 placeholder:text-parchment/50 focus:border-blood/60 disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled}
        className="px-4 py-2 font-cinzel text-base text-parchment bg-blood/30 hover:bg-blood/50 border border-blood rounded disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  );
}
