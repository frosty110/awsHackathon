import type { UsageBreakdown } from '../hooks/useSSEChat';
import {
  BEDROCK_HAIKU_INPUT_PER_TOKEN,
  BEDROCK_HAIKU_OUTPUT_PER_TOKEN,
  MINIMAX_TTS_PER_CHAR,
} from '@ai-dm/shared-types';

function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtQty(n: number): string {
  return n.toLocaleString();
}

function fmtRate(perUnit: number, unitLabel: string): string {
  // Express rate as $/1M for tokens, $/1K for characters
  if (unitLabel === 'tokens') return `$${(perUnit * 1_000_000).toFixed(2)}/1M`;
  return `$${(perUnit * 1_000).toFixed(2)}/1K`;
}

interface Props {
  breakdown: UsageBreakdown;
}

export function CostTooltip({ breakdown }: Props) {
  const total = breakdown.bedrockCost + breakdown.ttsCost;
  if (total <= 0) return null;

  const lines: Array<{
    label: string;
    qty: number;
    unit: string;
    rate: number;
    subtotal: number;
  }> = [];

  if (breakdown.bedrockInputTokens > 0) {
    lines.push({
      label: 'AWS Bedrock (Input)',
      qty: breakdown.bedrockInputTokens,
      unit: 'tokens',
      rate: BEDROCK_HAIKU_INPUT_PER_TOKEN,
      subtotal: breakdown.bedrockInputTokens * BEDROCK_HAIKU_INPUT_PER_TOKEN,
    });
  }

  if (breakdown.bedrockOutputTokens > 0) {
    lines.push({
      label: 'AWS Bedrock (Output)',
      qty: breakdown.bedrockOutputTokens,
      unit: 'tokens',
      rate: BEDROCK_HAIKU_OUTPUT_PER_TOKEN,
      subtotal: breakdown.bedrockOutputTokens * BEDROCK_HAIKU_OUTPUT_PER_TOKEN,
    });
  }

  if (breakdown.ttsCharacters > 0) {
    lines.push({
      label: 'MiniMax TTS',
      qty: breakdown.ttsCharacters,
      unit: 'chars',
      rate: MINIMAX_TTS_PER_CHAR,
      subtotal: breakdown.ttsCharacters * MINIMAX_TTS_PER_CHAR,
    });
  }

  return (
    <div className="group/cost relative">
      <span className="font-mono text-sm text-dm-gold/70 cursor-default">
        {fmtCost(total)}
      </span>

      {/* Tooltip */}
      <div className="hidden group-hover/cost:block absolute top-full right-0 mt-2 z-50 min-w-[340px] bg-surface border border-blood/30 rounded-lg shadow-xl p-4">
        <div className="font-mono text-xs space-y-2">
          {lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-4">
              <span className="text-parchment/80 whitespace-nowrap">{line.label}</span>
              <span className="text-parchment/60 whitespace-nowrap">
                {fmtQty(line.qty)} {line.unit} &times; {fmtRate(line.rate, line.unit)}
              </span>
              <span className="text-dm-gold ml-auto">{fmtCost(line.subtotal)}</span>
            </div>
          ))}

          <div className="border-t border-blood/30 pt-2 flex justify-between">
            <span className="text-parchment font-semibold">Total</span>
            <span className="text-dm-gold font-semibold">{fmtCost(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
