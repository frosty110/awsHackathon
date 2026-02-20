import { config } from "./config.js";

export interface TTSResult {
  audioBuffer: Buffer;
  audioFormat: string;
  durationMs: number;
}

export async function generateTTS(text: string): Promise<TTSResult> {
  const url = `https://api.minimax.io/v1/t2a_v2?GroupId=${config.MINIMAX_GROUP_ID}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "speech-2.8-hd",
      text,
      stream: false,
      output_format: "hex",
      voice_setting: {
        voice_id: "English_CaptivatingStoryteller",
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        format: "mp3",
        channel: 1,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `MiniMax TTS HTTP error: ${response.status} ${response.statusText}`
    );
  }

  const json = await response.json() as {
    base_resp: { status_code: number; status_msg: string };
    data: { audio: string };
    extra_info: { audio_format?: string; audio_length?: number };
  };

  if (json.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax TTS application error: ${json.base_resp.status_code} — ${json.base_resp.status_msg}`
    );
  }

  const audioBuffer = Buffer.from(json.data.audio, "hex");

  return {
    audioBuffer,
    audioFormat: json.extra_info.audio_format ?? "mp3",
    durationMs: json.extra_info.audio_length ?? 0,
  };
}
