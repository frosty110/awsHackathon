import { Router } from "express";
import { z } from "zod";
import {
  upsertSave,
  listSaves,
  deleteSave,
  renameSave,
  findByConversationId,
} from "../services/saveStore.js";
import { getOrCreate, ConversationOwnershipError } from "../services/conversationStore.js";
import { logEvent } from "../services/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const saveBodySchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(50).trim(),
  characterClass: z.string().optional().default(''),
  pronouns: z.string().optional().default(''),
  mode: z.enum(['single', 'multi']).optional().default('single'),
});

const renameBodySchema = z.object({
  name: z.string().min(1).max(50).trim(),
});

const router = Router();

/**
 * GET /api/saves
 * Returns all saves for the authenticated user, newest first.
 */
router.get("/api/saves", async (req: AuthenticatedRequest, res) => {
  try {
    const saves = await listSaves(req.userId!);
    res.status(200).json({ saves });
  } catch (err) {
    logEvent("error", "saves.list_failed", { userId: req.userId }, err);
    res.status(500).json({ error: "Failed to list saves" });
  }
});

/**
 * POST /api/saves
 * Creates a new save slot for the authenticated user.
 * Verifies conversationId ownership before saving.
 */
router.post("/api/saves", async (req: AuthenticatedRequest, res) => {
  const parsed = saveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    logEvent("warn", "saves.validation_failed", {
      route: "/api/saves",
      errors: parsed.error.flatten().fieldErrors,
    });
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const body = parsed.data;

  // Verify the conversationId belongs to req.userId (IDOR check via conversationStore)
  try {
    await getOrCreate(body.conversationId, req.userId!);
  } catch (err) {
    if (err instanceof ConversationOwnershipError) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    logEvent("error", "saves.conversation_lookup_failed", {
      userId: req.userId,
      conversationId: body.conversationId,
    }, err);
    res.status(500).json({ error: "Failed to verify conversation" });
    return;
  }

  const now = Date.now();
  const meta = {
    name: body.name,
    characterClass: body.characterClass,
    pronouns: body.pronouns,
    turnCount: 0,
    savedAt: now,
    lastPlayedAt: now,
    mode: body.mode,
  };

  try {
    await upsertSave(req.userId!, body.conversationId, meta);
    res.status(201).json({
      save: {
        conversationId: body.conversationId,
        ...meta,
      },
    });
  } catch (err) {
    logEvent("error", "saves.create_failed", {
      userId: req.userId,
      conversationId: body.conversationId,
    }, err);
    res.status(500).json({ error: "Failed to create save" });
  }
});

/**
 * PUT /api/saves/:id/name
 * Renames an existing save slot. :id is the conversationId.
 */
router.put("/api/saves/:id/name", async (req: AuthenticatedRequest, res) => {
  const conversationId = req.params.id as string;
  const parsed = renameBodySchema.safeParse(req.body);
  if (!parsed.success) {
    logEvent("warn", "saves.rename_validation_failed", {
      route: `/api/saves/${conversationId}/name`,
      errors: parsed.error.flatten().fieldErrors,
    });
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  // Verify ownership: check the save exists for this user
  const existingSave = await findByConversationId(req.userId!, conversationId);
  if (!existingSave) {
    res.status(404).json({ error: "Save not found" });
    return;
  }

  try {
    const success = await renameSave(req.userId!, conversationId, parsed.data.name);
    if (!success) {
      res.status(404).json({ error: "Save not found" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    logEvent("error", "saves.rename_failed", {
      userId: req.userId,
      conversationId,
    }, err);
    res.status(500).json({ error: "Failed to rename save" });
  }
});

/**
 * DELETE /api/saves/:id
 * Removes a save slot. :id is the conversationId.
 * Idempotent — no error if already deleted.
 * IDOR safe: deleteSave keys are scoped to req.userId
 */
router.delete("/api/saves/:id", async (req: AuthenticatedRequest, res) => {
  const conversationId = req.params.id as string;

  try {
    await deleteSave(req.userId!, conversationId);
    res.status(200).json({ ok: true });
  } catch (err) {
    logEvent("error", "saves.delete_failed", {
      userId: req.userId,
      conversationId,
    }, err);
    res.status(500).json({ error: "Failed to delete save" });
  }
});

export default router;
