import tracer from "dd-trace";
import { config } from "./config.js";
import { logEvent } from "./logger.js";
import { buildKey, get as s3Get, put as s3Put } from "./mediaCache.js";
import { recordVideoUsage } from "./usageTracker.js";
import type { SceneId } from "@ai-dm/shared-types";

const SCENE_PROMPTS: Record<SceneId, string> = {
  tavern_idle: "Dark fantasy tavern interior, warm firelight flickering on wooden beams, half-empty common room, stone hearth with low flames, tankards on tables, atmospheric smoke, medieval inn, cinematic looping ambient shot, no camera movement",
  tavern_tense: "Tense confrontation inside a dark medieval tavern, two figures facing off across a table, firelight casting dramatic shadows, patrons frozen in place, cinematic tension, dark fantasy aesthetic, looping ambient shot",
  goblin_ambush: "Goblins bursting through a wooden door into a tavern, green-skinned creatures with rusted weapons, chaotic attack scene, splinters flying, dark fantasy, dramatic lighting, cinematic action shot, looping",
  combat_melee: "Sword combat in a stone interior, sparks flying from clashing blades, two warriors fighting, dramatic torchlight, dark fantasy dungeon, cinematic action, looping combat scene",
  cave_entrance: "Dark cave mouth set into forested hills, eerie mist rolling out, twisted trees framing the entrance, moonlight filtering through clouds, dark fantasy landscape, cinematic establishing shot, looping",
  cave_interior: "Underground tunnel in a fantasy dungeon, dripping water, faint bioluminescent glow on cave walls, stalactites, narrow passage disappearing into darkness, cinematic ambient shot, looping",
  npc_dialogue: "Gruff dwarf barkeep behind a wooden counter in a medieval tavern, braided beard, dim firelight, fantasy character portrait scene, atmospheric, cinematic medium shot, looping",
  forest_path: "Winding path through a dark ancient forest, gnarled trees with twisted branches, fog drifting between trunks, faint moonlight, dark fantasy atmosphere, cinematic tracking shot, looping",
  town_street: "Medieval town street at night, cobblestone road, hanging lanterns casting warm pools of light, half-timbered buildings, dark fantasy aesthetic, atmospheric mist, cinematic shot, looping",
  campfire: "Campfire in a forest clearing at night, warm orange glow illuminating bedrolls and gear, embers floating upward, dark trees surrounding, fantasy adventure camp, cinematic ambient shot, looping",
  treasure_found: "Glowing magical artifact revealed in a dark stone chamber, golden light radiating from an ornate chest, dust particles in light beams, fantasy treasure discovery, cinematic reveal shot, looping",
  magic_spell: "Arcane magical energy swirling in the air, glowing blue and purple runes orbiting, fantasy spell casting, particle effects, dark atmospheric background, cinematic shot, looping",
  fireball: "Massive fireball erupting in a stone dungeon chamber, orange and red flames expanding, heat distortion, dramatic fantasy combat magic, cinematic explosion shot, looping",
  stealth: "Cloaked figure creeping through deep shadows in a stone corridor, moonlight through narrow windows, dark fantasy stealth scene, atmospheric tension, cinematic shot, looping",
  trap_danger: "Ancient trap mechanism activating in a dungeon corridor, arrows shooting from wall slots, pressure plate, stone dust falling, dark fantasy danger, dramatic cinematic shot, looping",
  locked_door: "Ornate locked door covered in ancient glowing runes, massive iron hinges, stone archway in a dungeon, mysterious light seeping through cracks, dark fantasy, cinematic shot, looping",
  rain_storm: "Heavy rain falling on a medieval town at night, lightning illuminating stone buildings, puddles on cobblestone, dramatic storm, dark fantasy atmosphere, cinematic wide shot, looping",
  victory: "Triumphant fantasy hero standing in golden light, epic rays breaking through clouds, victorious pose, dramatic moment, dark fantasy aesthetic, cinematic hero shot, looping",
  defeat: "Fallen warrior kneeling in fading light, somber atmosphere, dust settling, broken weapon nearby, dark fantasy defeat, melancholic cinematic shot, looping",
  potion_drink: "Glowing potion bottles on an alchemist table, bubbling liquids in various colors, fantasy alchemy lab, mysterious ambient light, dark atmospheric, cinematic close-up shot, looping",
  bridge_crossing: "Narrow stone bridge spanning a dark bottomless chasm, rope railings, mist rising from below, faint torchlight, dark fantasy architecture, cinematic wide shot, looping",
  throne_room: "Dark fantasy throne room with tall stone pillars, empty imposing throne, torchlight casting long shadows, gothic architecture, ominous atmosphere, cinematic establishing shot, looping",
  moonrise: "Full moon rising over dark fantasy hills, silver moonlight illuminating rolling landscape, silhouetted trees, atmospheric clouds, cinematic landscape shot, looping",
  merchant: "Medieval merchant stall displaying potions and fantasy weapons, colorful bottles, ornate swords, busy market atmosphere, lantern light, dark fantasy bazaar, cinematic shot, looping",
  dice_roll: "Glowing magical d20 die rolling across a worn wooden surface, fantasy runes on the die faces, warm tavern light, dramatic close-up, particle effects, cinematic shot, looping",
};

interface SceneCacheEntry {
  video: Buffer | null;
  generating: boolean;
  error: string | null;
  lastFailedAt: number | null;
  retryCount: number;
  generationStartedAt: number | null;
}

const sceneVideoCache = new Map<SceneId, SceneCacheEntry>();

const RETRY_COOLDOWN_MS = 60_000;
const MAX_RETRIES = 2;
const GENERATION_TIMEOUT_MS = 180_000;
const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 10_000;

let videoCacheHits = 0;
let videoCacheMisses = 0;

export function getSceneVideoStats() {
  const scenes: Record<string, boolean> = {};
  for (const [scene, entry] of sceneVideoCache) {
    scenes[scene] = entry.video !== null;
  }
  return { hits: videoCacheHits, misses: videoCacheMisses, scenes };
}

function buildVideoS3Key(scene: SceneId): string {
  return buildKey("video/v1", `video-01|${scene}|${SCENE_PROMPTS[scene]}`, "mp4");
}

/**
 * Try loading a scene video from S3 into the L1 cache.
 * Returns true if the video was loaded from S3.
 */
export async function tryLoadFromS3(scene: SceneId): Promise<boolean> {
  const entry = getOrCreateEntry(scene);
  if (entry.video || entry.generating) return false;
  try {
    const s3Buf = await s3Get(buildVideoS3Key(scene));
    if (s3Buf) {
      entry.video = s3Buf;
      tracer.dogstatsd.increment('cache.hit', 1, { cache_type: 'video', source: 's3' });
      logEvent("info", "video.s3_cache_hit", { scene, bytes: s3Buf.length });
      return true;
    }
  } catch (err) {
    logEvent("warn", "video.s3_cache_get_failed", { scene, error: String(err) });
  }
  return false;
}

export function getOrCreateEntry(scene: SceneId): SceneCacheEntry {
  let entry = sceneVideoCache.get(scene);
  if (!entry) {
    entry = { video: null, generating: false, error: null, lastFailedAt: null, retryCount: 0, generationStartedAt: null };
    sceneVideoCache.set(scene, entry);
  }
  return entry;
}

export function startGeneration(scene: SceneId) {
  const entry = getOrCreateEntry(scene);
  if (entry.generating || entry.video) return;
  if (entry.retryCount >= MAX_RETRIES) return;
  if (entry.error && entry.lastFailedAt && Date.now() - entry.lastFailedAt < RETRY_COOLDOWN_MS) return;
  if (entry.error) {
    entry.retryCount++;
    logEvent("info", "video.retrying_after_failure", {
      scene,
      previousError: entry.error,
      retryCount: entry.retryCount,
      maxRetries: MAX_RETRIES,
    });
    entry.error = null;
  }
  entry.generating = true;
  entry.generationStartedAt = Date.now();

  logEvent("info", "video.generation_started", {
    scene,
    model: "video-01",
    provider: "minimax",
  });

  void runGeneration(scene);
}

async function runGeneration(scene: SceneId) {
  const entry = getOrCreateEntry(scene);
  const overallStart = Date.now();
  const prompt = SCENE_PROMPTS[scene];

  try {
    const apiKey = config.MINIMAX_API_KEY;

    // Step 1: Submit video generation task
    const submitRes = await fetch("https://api.minimax.io/v1/video_generation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "video-01",
        prompt,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!submitRes.ok) throw new Error(`MiniMax video submit HTTP ${submitRes.status}`);

    const submitJson = (await submitRes.json()) as {
      base_resp?: { status_code: number; status_msg: string };
      task_id?: string;
    };

    if (submitJson.base_resp && submitJson.base_resp.status_code !== 0) {
      throw new Error(`MiniMax video submit error: ${submitJson.base_resp.status_msg}`);
    }

    const taskId = submitJson.task_id;
    if (!taskId) throw new Error("No task_id in video generation response");

    logEvent("info", "video.task_submitted", { scene, taskId });

    // Step 2: Poll for completion
    let fileId: string | null = null;
    const pollStart = Date.now();
    let attempt = 0;

    while (Date.now() - pollStart < GENERATION_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      attempt++;

      const pollRes = await fetch(
        `https://api.minimax.io/v1/query/video_generation?task_id=${taskId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (!pollRes.ok) throw new Error(`MiniMax video poll HTTP ${pollRes.status}`);

      const pollJson = (await pollRes.json()) as {
        base_resp?: { status_code: number; status_msg: string };
        status?: string;
        file_id?: string;
      };

      logEvent("info", "video.poll_progress", {
        scene,
        taskId,
        attempt,
        maxAttempts: Math.floor(GENERATION_TIMEOUT_MS / POLL_INTERVAL_MS),
        status: pollJson.status ?? "unknown",
        elapsedMs: Date.now() - pollStart,
      });

      if (pollJson.base_resp && pollJson.base_resp.status_code !== 0) {
        throw new Error(`MiniMax video poll error: ${pollJson.base_resp.status_msg}`);
      }

      if (pollJson.status === "Fail") {
        throw new Error("MiniMax video generation failed");
      }

      if (pollJson.status === "Success" && pollJson.file_id) {
        fileId = pollJson.file_id;
        break;
      }
    }

    if (!fileId) throw new Error("Video generation timed out");

    logEvent("info", "video.generation_complete", { scene, taskId, fileId });

    // Step 3: Get download URL
    const fileRes = await fetch(
      `https://api.minimax.io/v1/files/retrieve?file_id=${fileId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!fileRes.ok) throw new Error(`MiniMax file retrieve HTTP ${fileRes.status}`);

    const fileJson = (await fileRes.json()) as {
      base_resp?: { status_code: number; status_msg: string };
      file?: { download_url?: string };
    };

    const downloadUrl = fileJson.file?.download_url;
    if (!downloadUrl) throw new Error("No download_url in file retrieve response");

    // Step 4: Download the video
    const videoRes = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!videoRes.ok) throw new Error(`Video download failed: ${videoRes.status}`);

    entry.video = Buffer.from(await videoRes.arrayBuffer());

    // L2: fire-and-forget S3 persist
    s3Put(buildVideoS3Key(scene), entry.video, "video/mp4", { scene, model: "video-01" })
      .catch((err) => logEvent("warn", "video.s3_cache_put_failed", { scene, error: String(err) }));

    const generationDurationMs = Date.now() - overallStart;
    const videoSizeBytes = entry.video.length;
    recordVideoUsage();

    try {
      tracer.llmobs.trace(
        { kind: "tool", name: "minimax.video_generation" },
        (span) => {
          tracer.llmobs.annotate(span, {
            inputData: JSON.stringify({ prompt: prompt.slice(0, 200), model: "video-01", scene }),
            outputData: JSON.stringify({
              videoSizeBytes,
              format: "mp4",
            }),
            metrics: {
              generationDurationMs,
              videoSizeBytes,
            },
            tags: {
              "video.provider": "minimax",
              "video.model": "video-01",
              "video.scene": scene,
            },
          });
        },
      );
    } catch { /* tracing failure should not affect video delivery */ }

    logEvent("info", "video.generation_completed", {
      scene,
      generationDurationMs,
      videoSizeBytes,
      videoSizeKB: Math.round(videoSizeBytes / 1024),
    });
  } catch (err) {
    entry.error = String(err);
    entry.lastFailedAt = Date.now();
    const totalMs = Date.now() - overallStart;

    try {
      tracer.llmobs.trace(
        { kind: "tool", name: "minimax.video_generation" },
        (span) => {
          tracer.llmobs.annotate(span, {
            inputData: JSON.stringify({ prompt: prompt.slice(0, 200), model: "video-01", scene }),
            outputData: JSON.stringify({ error: entry.error }),
            tags: {
              "video.provider": "minimax",
              "video.model": "video-01",
              "video.error": "true",
              "video.scene": scene,
            },
          });
        },
      );
    } catch { /* tracing failure should not affect error reporting */ }

    logEvent(
      "error",
      "video.generation_failed",
      {
        scene,
        durationMs: totalMs,
        failureType: "terminal",
      },
      err,
    );
  } finally {
    entry.generating = false;
  }
}
