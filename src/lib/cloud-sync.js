import { normalizeState } from "./model";
import { withMidtermSet } from "./midterm";
import { statePatch, applyPatch, hasPatch } from "./sync-merge";

const freshState = () => withMidtermSet({ sets: [], activeSetId: null });
const empty = () => ({ sets: [], installedStudySets: [], activeSetId: null });

export class CloudSync {
  constructor({ client, userId, getState, onState, onStatus, cache = localStorage }) {
    Object.assign(this, { client, userId, getState, onState, onStatus, cache });
    this.cacheKey = `flashcards-cloud-snapshot-${userId}`;
    this.stopped = false;
    this.running = null;
    try {
      const saved = JSON.parse(cache.getItem(this.cacheKey));
      if (saved) this.baseline = normalizeState(saved.state);
    } catch { /* The local app backup still protects unsynced progress. */ }
  }

  async sync() {
    if (this.stopped) return;
    if (this.running) { this.again = true; return this.running; }
    this.running = this.perform().catch(() => {
      if (!this.stopped) this.onStatus("Saved here · sync will retry");
    }).finally(() => {
      this.running = null;
      if (this.again && !this.stopped) {
        this.again = false;
        void this.sync();
      }
    });
    return this.running;
  }

  async perform() {
    this.onStatus("Syncing…");
    const current = this.getState();
    const belongsHere = !current.syncAccountId || current.syncAccountId === this.userId;
    const local = belongsHere ? current : (this.baseline || freshState());
    let changes;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: row, error } = await this.client.from("flashcard_states")
        .select("state,version").eq("user_id", this.userId).maybeSingle();
      if (error) throw error;
      if (this.stopped) return;
      const remote = row ? normalizeState(row.state) : empty();
      if (!changes) {
        // First login carries meaningful guest changes, but never downgrades
        // cloud ratings just because this device has untouched red defaults.
        const before = this.baseline || (row ? freshState() : empty());
        changes = statePatch(before, local);
      }
      let merged = normalizeState(applyPatch(remote, changes));
      if (!row || hasPatch(changes)) {
        const { data: saved, error: saveError } = await this.client.rpc("save_flashcard_state", {
          target_user_id: this.userId,
          expected_version: row?.version || 0,
          next_state: merged,
        });
        if (saveError?.code === "40001") continue;
        if (saveError) throw saveError;
        merged = normalizeState(saved.state);
      }
      if (this.stopped) return;
      this.baseline = merged;
      try { this.cache.setItem(this.cacheKey, JSON.stringify({ state: merged })); }
      catch { /* Sync succeeds even if a browser's snapshot cache is full. */ }
      const latest = this.getState();
      const duringRequest = belongsHere ? statePatch(current, latest) : statePatch(local, local);
      const next = normalizeState(applyPatch(merged, duringRequest));
      next.syncAccountId = this.userId;
      if (next.sets.some((set) => set.id === latest.activeSetId)) next.activeSetId = latest.activeSetId;
      this.onState(next);
      this.onStatus(hasPatch(duringRequest) ? "Syncing…" : "Synced across devices");
      if (hasPatch(duringRequest)) this.again = true;
      return;
    }
    throw new Error("Sync conflict; retry on the next poll.");
  }

  stop() { this.stopped = true; }
}
