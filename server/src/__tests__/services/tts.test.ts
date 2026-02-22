import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted before imports) ──────────────────────────────────

vi.mock('dd-trace', () => ({
  default: {
    llmobs: {
      trace: (_opts: unknown, cb: (span: unknown) => unknown) => cb(undefined),
      annotate: () => {},
    },
    dogstatsd: {
      increment: () => {},
    },
    trace: (_name: unknown, _opts: unknown, cb: (span: unknown) => unknown) => cb(undefined),
  },
}));

vi.mock('../../services/mediaCache.js', () => ({
  buildKey: (_prefix: string, _input: string, _ext: string) => `mock-s3-key`,
  get: vi.fn(async () => null),   // default: L2 cache miss
  put: vi.fn(async () => {}),
}));

vi.mock('../../services/config.js', () => ({
  config: {
    MINIMAX_API_KEY: 'test-key',
    MINIMAX_GROUP_ID: 'test-group',
    S3_AUDIO_CACHE_BUCKET: '',
    S3_MEDIA_CACHE_BUCKET: '',
  },
}));

vi.mock('../../services/logger.js', () => ({
  logEvent: vi.fn(() => {}),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { generateMultiVoiceTTS } from '../../services/tts.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a mock fetch Response that returns a MiniMax-shaped JSON payload. */
function makeMiniMaxResponse(audioHex: string, durationMs = 2000): Response {
  return {
    ok: true,
    json: async () => ({
      base_resp: { status_code: 0, status_msg: 'ok' },
      data: { audio: audioHex },
      extra_info: { audio_format: 'mp3', audio_length: durationMs },
    }),
  } as unknown as Response;
}

/** Encode a unique marker so we can verify concatenation order. */
function segmentHex(marker: string): string {
  return Buffer.from(`audio-segment-${marker}`).toString('hex');
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('generateMultiVoiceTTS', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    vi.stubGlobal('fetch', vi.fn());
  });

  it('generates segments in parallel (all succeed)', async () => {
    // 3 segments: narrator, barkeep, narrator
    const text =
      'Intro text {{voice:barkeep}}Hello there{{/voice}} closing text';

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeMiniMaxResponse(segmentHex('narrator-intro'), 1000))
      .mockResolvedValueOnce(makeMiniMaxResponse(segmentHex('barkeep'), 1200))
      .mockResolvedValueOnce(makeMiniMaxResponse(segmentHex('narrator-close'), 800));

    vi.stubGlobal('fetch', mockFetch);

    const result = await generateMultiVoiceTTS(text);

    // fetch called once per segment (3 total)
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // returned buffer is non-empty concatenation
    expect(result.audioBuffer.length).toBeGreaterThan(0);

    // duration is sum of all segment durations
    expect(result.durationMs).toBe(3000);
    expect(result.audioFormat).toBe('mp3');
  });

  it('preserves segment order regardless of completion order', async () => {
    const text =
      '{{voice:goblin}}hiss{{/voice}} middle {{voice:barkeep}}aye{{/voice}}';

    // Segment 0 (goblin): resolves after 50ms
    // Segment 1 (middle narrator): resolves after 10ms (fastest)
    // Segment 2 (barkeep): resolves after 30ms
    const mockFetch = vi.fn()
      .mockImplementationOnce(() =>
        new Promise((resolve) =>
          setTimeout(() => resolve(makeMiniMaxResponse(segmentHex('seg0'), 500)), 50)
        )
      )
      .mockImplementationOnce(() =>
        new Promise((resolve) =>
          setTimeout(() => resolve(makeMiniMaxResponse(segmentHex('seg1'), 300)), 10)
        )
      )
      .mockImplementationOnce(() =>
        new Promise((resolve) =>
          setTimeout(() => resolve(makeMiniMaxResponse(segmentHex('seg2'), 400)), 30)
        )
      );

    vi.stubGlobal('fetch', mockFetch);

    const result = await generateMultiVoiceTTS(text);

    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Build the expected concatenation order (seg0, seg1, seg2)
    const expectedBuffer = Buffer.concat([
      Buffer.from(segmentHex('seg0'), 'hex'),
      Buffer.from(segmentHex('seg1'), 'hex'),
      Buffer.from(segmentHex('seg2'), 'hex'),
    ]);

    expect(result.audioBuffer).toEqual(expectedBuffer);
  });

  it('falls back to narrator when non-narrator voice fails', async () => {
    // Single barkeep segment — clean isolation: only one concurrent fetch at a time here
    const text = '{{voice:barkeep}}Hey there{{/voice}}';

    // First call (barkeep voice): reject
    // Second call (narrator fallback): succeed
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('barkeep voice unavailable'))
      .mockResolvedValueOnce(makeMiniMaxResponse(segmentHex('barkeep-fallback'), 1000));

    vi.stubGlobal('fetch', mockFetch);

    const result = await generateMultiVoiceTTS(text);

    // 1 segment: 1 failed attempt + 1 fallback = 2 total calls
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Result contains the fallback audio buffer
    const expectedBuffer = Buffer.from(segmentHex('barkeep-fallback'), 'hex');
    expect(result.audioBuffer).toEqual(expectedBuffer);
    expect(result.durationMs).toBe(1000);
  });

  it('throws when narrator voice fails', async () => {
    // Plain text with no voice tags → single narrator segment
    const text = 'Only the narrator speaks here.';

    const mockFetch = vi.fn().mockRejectedValue(new Error('narrator API error'));

    vi.stubGlobal('fetch', mockFetch);

    await expect(generateMultiVoiceTTS(text)).rejects.toThrow('narrator API error');
  });

  it('handles single-segment text (no voice tags)', async () => {
    const text = 'A lone narrator voice with no embedded characters.';

    const mockFetch = vi.fn().mockResolvedValue(
      makeMiniMaxResponse(segmentHex('solo-narrator'), 2500)
    );

    vi.stubGlobal('fetch', mockFetch);

    const result = await generateMultiVoiceTTS(text);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.audioBuffer).toEqual(Buffer.from(segmentHex('solo-narrator'), 'hex'));
    expect(result.durationMs).toBe(2500);
  });

  it('uses combat prosody when mood tag is present in text', async () => {
    // {{mood:combat}} prefix triggers combat prosody: speed 1.15, pitch 2
    const text = '{{mood:combat}}Steel clashes in the dark chamber.';

    const mockFetch = vi.fn().mockResolvedValue(
      makeMiniMaxResponse(segmentHex('combat-narrator'), 1800)
    );

    vi.stubGlobal('fetch', mockFetch);

    await generateMultiVoiceTTS(text);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Inspect the fetch call body to confirm prosody was applied
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as {
      voice_setting: { speed: number; pitch: number };
    };

    expect(body.voice_setting.speed).toBe(1.15);
    expect(body.voice_setting.pitch).toBe(2);
  });

  it('throws narrator failure even after non-narrator fallback is attempted', async () => {
    // barkeep segment fails, fallback to narrator also fails → should throw
    const text = '{{voice:barkeep}}Barkeep talks{{/voice}}';

    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('barkeep voice down'))  // original barkeep attempt
      .mockRejectedValueOnce(new Error('narrator also down'));  // narrator fallback attempt

    vi.stubGlobal('fetch', mockFetch);

    await expect(generateMultiVoiceTTS(text)).rejects.toThrow('narrator also down');
  });
});
