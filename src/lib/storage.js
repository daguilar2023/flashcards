import Dexie from "dexie";
import { normalizeState } from "./model";
import { withMidtermSet } from "./midterm";

const db = new Dexie("flashcardsDB");
db.version(1).stores({ kv: "key" });
const KEY = "flashcards_app_v1";
let saveQueue = Promise.resolve();
let lastSavedAt = 0;

export async function loadState() {
  let databaseUnavailable = false;
  let unreadable = false;
  const candidates = [];
  try {
    const row = await db.table("kv").get("state");
    if (row?.value) {
      try {
        candidates.push({
          state: normalizeState(row.value),
          savedAt: row.value.savedAt || 0,
          source: "database",
        });
      } catch {
        unreadable = true;
      }
    }
  } catch {
    databaseUnavailable = true;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const value = JSON.parse(raw);
      candidates.push({
        state: normalizeState(value),
        savedAt: value.savedAt || 0,
        source: "backup",
      });
    }
  } catch {
    unreadable = true;
  }
  if (candidates.length) {
    candidates.sort((a, b) => b.savedAt - a.savedAt);
    lastSavedAt = candidates[0].savedAt;
    return {
      state: withMidtermSet(candidates[0].state),
      warning: databaseUnavailable ? "Using browser backup storage." : "",
    };
  }
  // Preserve unreadable data and avoid overwriting it with an empty collection.
  if (unreadable || databaseUnavailable)
    return {
      state: { sets: [], activeSetId: null },
      blocked: true,
      warning: unreadable
        ? "Saved data could not be read. Import a backup to recover your cards."
        : "Local database unavailable. Refresh to retry, or import a backup.",
    };
  return { state: withMidtermSet({ sets: [], activeSetId: null }), warning: "" };
}
export function saveState(state) {
  const operation = async () => {
    lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
    const payload = { ...state, savedAt: lastSavedAt };
    let savedBackup = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      savedBackup = true;
    } catch {
      /* IndexedDB supports larger image collections. */
    }
    try {
      await db.table("kv").put({ key: "state", value: payload });
      return "Saved on this device";
    } catch {
      if (savedBackup) return "Saved in browser backup";
      throw new Error(
        "Your changes could not be saved. Export a backup before closing.",
      );
    }
  };
  saveQueue = saveQueue.catch(() => undefined).then(operation);
  return saveQueue;
}
