import type { SceneMood } from "@ai-dm/shared-types";

/** MiniMax music generation prompts keyed by scene mood. */
export const MOOD_PROMPTS: Record<SceneMood, string> = {
  combat:
    "Epic orchestral fantasy battle, urgent drums, brass fanfare, instrumental, no vocals, fast tempo",
  tavern:
    "Medieval tavern folk music, lute, fiddle, warm acoustic, instrumental, no vocals, moderate tempo",
  mystery:
    "Dark ambient fantasy, ethereal pads, subtle strings, suspenseful, instrumental, no vocals, slow tempo",
  dramatic:
    "Cinematic orchestral fantasy, sweeping strings, emotional crescendo, instrumental, no vocals, moderate tempo",
  danger:
    "Ominous dark fantasy, deep drums, minor key strings, tension building, instrumental, no vocals, slow tempo",
};
