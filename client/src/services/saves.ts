import { API_BASE } from './apiBase';
import { authHeaders, refreshAccessToken } from './auth';

export interface SaveRecord {
  conversationId: string;
  name: string;
  characterClass: string;
  pronouns: string;
  turnCount: number;
  savedAt: number;
  lastPlayedAt: number;
  mode: 'single' | 'multi';
}

/**
 * List all saved adventures for the current user.
 * Returns an empty array on error (graceful degradation).
 */
export async function listSaves(): Promise<SaveRecord[]> {
  try {
    let res = await fetch(`${API_BASE}/api/saves`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`${API_BASE}/api/saves`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
        });
      }
    }

    if (!res.ok) return [];
    const data = await res.json() as { saves?: SaveRecord[] };
    return data.saves ?? [];
  } catch {
    return [];
  }
}

/**
 * Create a new save for the current conversation.
 * Returns the created save on success, null on error.
 */
export async function createSave(
  conversationId: string,
  name: string,
  characterClass?: string,
  pronouns?: string,
  mode?: 'single' | 'multi'
): Promise<SaveRecord | null> {
  try {
    let res = await fetch(`${API_BASE}/api/saves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ conversationId, name, characterClass, pronouns, mode }),
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`${API_BASE}/api/saves`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ conversationId, name, characterClass, pronouns, mode }),
        });
      }
    }

    if (!res.ok) return null;
    const data = await res.json() as { save?: SaveRecord };
    return data.save ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete a saved adventure by conversationId.
 * Returns true on success.
 */
export async function deleteSave(conversationId: string): Promise<boolean> {
  try {
    let res = await fetch(`${API_BASE}/api/saves/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`${API_BASE}/api/saves/${encodeURIComponent(conversationId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
        });
      }
    }

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Rename a saved adventure.
 * Returns true on success.
 */
export async function renameSave(conversationId: string, name: string): Promise<boolean> {
  try {
    let res = await fetch(`${API_BASE}/api/saves/${encodeURIComponent(conversationId)}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name }),
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`${API_BASE}/api/saves/${encodeURIComponent(conversationId)}/name`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ name }),
        });
      }
    }

    return res.ok;
  } catch {
    return false;
  }
}
