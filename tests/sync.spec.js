import { test, expect } from "@playwright/test";

test("two devices merge different ratings, recover offline changes, and retain remote deletions", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    const { normalizeState } = await import("/src/lib/model.js");
    const { statePatch, applyPatch } = await import("/src/lib/sync-merge.js");
    let row = { version: 1, state: normalizeState({ sets: [{
      id: "set", name: "Shared cards", color: "sage",
      cards: [{ id: "a", frontText: "A", backText: "Answer A" }, { id: "b", frontText: "B", backText: "Answer B" }],
      progress: { a: "red", b: "red" },
    }], activeSetId: "set", syncAccountId: "user" }) };
    let offline = false;
    let conflicts = 0;
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () =>
        offline ? { error: new Error("offline") } : { data: structuredClone(row) },
      }) }) }),
      rpc: async (_name, args) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (offline) return { error: new Error("offline") };
        if (args.expected_version !== row.version) {
          conflicts++;
          return { error: { code: "40001" } };
        }
        row = { version: row.version + 1, state: args.next_state };
        return { data: structuredClone(row) };
      },
    };
    const device = () => {
      const values = new Map([["flashcards-cloud-snapshot-user", JSON.stringify({ state: row.state })]]);
      const cache = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
      const d = { state: structuredClone(row.state), statuses: [], cache };
      d.connect = () => new CloudSync({ client, userId: "user", cache,
        getState: () => d.state, onState: (state) => { d.state = state; },
        onStatus: (text) => d.statuses.push(text),
      });
      d.sync = d.connect();
      return d;
    };
    const phone = device(), computer = device();
    phone.state.sets[0].progress.a = "green";
    computer.state.sets[0].progress.b = "yellow";
    await Promise.all([phone.sync.sync(), computer.sync.sync()]);
    await phone.sync.sync();
    const concurrent = structuredClone(row.state.sets[0].progress);
    const poll = structuredClone(phone.state.sets[0].progress);

    offline = true;
    phone.state.sets[0].progress.a = "yellow";
    await phone.sync.sync();
    const offlineState = phone.state.sets[0].progress.a;
    const offlineStatus = phone.statuses.at(-1);
    phone.sync.stop();
    offline = false;
    // Another device advances while the phone is offline.
    row.state.sets[0].progress.b = "green";
    row.version++;
    phone.sync = phone.connect();
    await phone.sync.sync();
    const recovered = structuredClone(row.state.sets[0].progress);

    const before = structuredClone(row.state);
    const deleted = structuredClone(before);
    deleted.sets[0].cards = deleted.sets[0].cards.filter((card) => card.id !== "a");
    const stale = structuredClone(before);
    stale.sets[0].progress.a = "red";
    const afterDelete = applyPatch(deleted, statePatch(before, stale));
    phone.sync.stop(); computer.sync.stop();
    return { concurrent, poll, conflicts, offlineState, offlineStatus, recovered,
      remainingIds: afterDelete.sets[0].cards.map((card) => card.id),
    };
  });
  expect(result.concurrent).toEqual({ a: "green", b: "yellow" });
  expect(result.poll).toEqual(result.concurrent);
  expect(result.conflicts).toBeGreaterThan(0);
  expect(result.offlineState).toBe("yellow");
  expect(result.offlineStatus).toContain("sync will retry");
  expect(result.recovered).toEqual({ a: "yellow", b: "green" });
  expect(result.remainingIds).toEqual(["b"]);
});

test("a fresh device downloads mastered cards without downgrading cloud progress", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    const { withMidtermSet } = await import("/src/lib/midterm.js");
    let local = withMidtermSet({ sets: [], activeSetId: null });
    const remote = structuredClone(local);
    remote.sets[0].progress[remote.sets[0].cards[0].id] = "green";
    let writes = 0;
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { state: remote, version: 5 } }) }) }) }),
      rpc: async () => { writes++; throw new Error("A clean download must not write"); },
    };
    const sync = new CloudSync({ client, userId: "user", getState: () => local,
      onState: (value) => { local = value; }, onStatus: () => {},
      cache: { getItem: () => null, setItem: () => {} },
    });
    await sync.sync(); sync.stop();
    return { writes, color: local.sets[0].progress[local.sets[0].cards[0].id], owner: local.syncAccountId };
  });
  expect(result).toEqual({ writes: 0, color: "green", owner: "user" });
});

test("ratings made during a pending save are retained and uploaded next", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    const { withMidtermSet } = await import("/src/lib/midterm.js");
    let local = withMidtermSet({ sets: [], activeSetId: null });
    let row = { version: 1, state: structuredClone(local) };
    const cache = { getItem: () => JSON.stringify({ state: row.state }), setItem: () => {} };
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let started;
    const requestStarted = new Promise((resolve) => { started = resolve; });
    let writes = 0;
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(row) }) }) }) }),
      rpc: async (_name, args) => {
        writes++;
        if (writes === 1) { started(); await gate; }
        row = { state: args.next_state, version: row.version + 1 };
        return { data: structuredClone(row) };
      },
    };
    const sync = new CloudSync({ client, userId: "user", cache,
      getState: () => local, onState: (state) => { local = state; }, onStatus: () => {},
    });
    const first = local.sets[0].cards[0].id, second = local.sets[0].cards[1].id;
    local = structuredClone(local);
    local.sets[0].progress[first] = "green";
    const pending = sync.sync();
    await requestStarted;
    local = structuredClone(local);
    local.sets[0].progress[second] = "yellow";
    release(); await pending; await sync.sync();
    sync.stop();
    return [row.state.sets[0].progress[first], row.state.sets[0].progress[second]];
  });
  expect(result).toEqual(["green", "yellow"]);
});

test("GitHub Pages routes survive reload and syncing has a clear setup state", async ({ page }) => {
  await page.goto("/#/learn");
  await expect(page.getByRole("button", { name: "Start studying", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Start studying", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in to sync devices", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Cloud sync setup is not finished yet");
});

test("legacy cloud midterm sections migrate and save once without changing ratings", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    const { withMidtermSet } = await import("/src/lib/midterm.js");
    let local = withMidtermSet({ sets: [], activeSetId: null });
    const old = structuredClone(local);
    delete old.sets[0].sections;
    delete old.sets[0].sectionSchemaVersion;
    old.sets[0].cards.forEach((card) => { delete card.sectionId; });
    old.sets[0].progress[old.sets[0].cards[0].id] = "green";
    // Deliberate user deletion must survive the upgrade.
    old.sets[0].cards.splice(1, 1);
    let row = { state: old, version: 8 }, writes = 0;
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(row) }) }) }) }),
      rpc: async (_name, args) => {
        writes++;
        row = { state: args.next_state, version: row.version + 1 };
        return { data: structuredClone(row) };
      },
    };
    const sync = new CloudSync({ client, userId: "user", getState: () => local,
      onState: (value) => { local = value; }, onStatus: () => {},
      cache: { getItem: () => null, setItem: () => {} },
    });
    await sync.sync(); await sync.sync(); sync.stop();
    const set = row.state.sets[0];
    return { writes, sections: set.sections.length, assigned: set.cards.every((card) => card.sectionId),
      cards: set.cards.length, color: set.progress[set.cards[0].id], version: set.sectionSchemaVersion };
  });
  expect(result).toEqual({ writes: 1, sections: 8, assigned: true, cards: 85, color: "green", version: 1 });
});
