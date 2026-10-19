import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const deck = JSON.parse(readFileSync(new URL("../src/data/vr-portfolio-1.json", import.meta.url), "utf8"));
const backup = JSON.parse(readFileSync(new URL("../public/study-decks/vr-portfolio-1.json", import.meta.url), "utf8"));
const key = "flashcards_app_v1";
const corrections = JSON.parse(readFileSync(new URL("../src/data/portfolio-content-corrections.json", import.meta.url), "utf8"));
const normalMapId = "vr-portfolio-1-demo-1-q05";
const lightingId = "vr-portfolio-1-demo-1-q06";
const unwrapId = "vr-portfolio-1-demo-1-q04";
const feedId = "vr-portfolio-1-demo-2-q02";
const magnusId = "vr-portfolio-1-demo-2-q05";

async function ready(page) {
  await page.goto("/");
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
}

for (const [answerId, priorVersion, preferred] of [
  [feedId, 4, "Before launching a practice ball, our code predicts its trajectory and calculates the upward launch speed needed to cross the net and land on the player’s half. After launch, the ball follows the normal physics simulation."],
  [magnusId, 5, "Drag is air resistance that slows the ball, becoming stronger at higher speeds. The Magnus effect makes a spinning ball curve: topspin pushes it downward, while backspin produces an upward force. Our project accounts for wind and limits the spin-effect coefficient to avoid excessive forces."],
]) {
test(`preferred answer ${answerId} upgrades without losing progress or personal edits`, async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async ({ deck, oldBack, feedId, priorVersion }) => {
    const { normalizeState } = await import("/src/lib/model.js");
    const old = structuredClone(deck);
    old.studyContentVersion = priorVersion;
    old.cards.find((card) => card.id === feedId).backText = oldBack;
    old.progress[feedId] = "green";
    const upgraded = normalizeState({ sets: [old] }).sets[0];
    const custom = structuredClone(old);
    custom.cards.find((card) => card.id === feedId).backText = "My own explanation";
    const kept = normalizeState({ sets: [custom] }).sets[0];
    custom.cards = custom.cards.filter((card) => card.id !== feedId);
    const deleted = normalizeState({ sets: [custom] }).sets[0];
    return { version: upgraded.studyContentVersion, rating: upgraded.progress[feedId],
      back: upgraded.cards.find((card) => card.id === feedId).backText,
      personal: kept.cards.find((card) => card.id === feedId).backText,
      deleted: !deleted.cards.some((card) => card.id === feedId) };
  }, { deck, oldBack: corrections[answerId].backText, feedId: answerId, priorVersion });
  expect(result.version).toBe(deck.studyContentVersion);
  expect(result.rating).toBe("green");
  expect(result.back).toBe(deck.cards.find((card) => card.id === answerId).backText);
  expect(result.back).toContain(`<h3>Short quiz answer</h3><p>${preferred}</p>`);
  expect(result.back.split("<h3>How our project does it</h3>")[1]).toBe(corrections[answerId].backText.split("<h3>How our project does it</h3>")[1]);
  expect(result.personal).toBe("My own explanation");
  expect(result.deleted).toBe(true);
});
}

test("UV card uses preferred answer, preserves details and ratings, and respects personal edits", async ({ page }, testInfo) => {
  const old = structuredClone(deck);
  old.studyContentVersion = 3;
  const original = old.cards.find((card) => card.id === unwrapId);
  original.backText = corrections[unwrapId].backText;
  old.progress[unwrapId] = "green";
  await page.addInitScript(({ key, old }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      sets: [old], activeSetId: old.id,
      installedStudySets: ["android-midterm-fall-2026", old.id],
    }));
  }, { key, old });
  await ready(page);
  await page.getByRole("button", { name: deck.name, exact: true }).click();
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await page.getByLabel("Search questions and answers").fill("How is your own model unwrapped?");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  await expect(page.locator(".answer-sheet-back")).toContainText("We applied a 2D texture to the 3D cabin using UV coordinates.");
  await expect(page.locator(".answer-sheet-back")).toContainText("with V going from 0 at the bottom to 1 at the top.");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).sets[0], key);
  const updated = saved.cards.find((card) => card.id === unwrapId);
  expect(saved.studyContentVersion).toBe(deck.studyContentVersion);
  expect(saved.progress[unwrapId]).toBe("green");
  expect(updated.frontText).toBe(original.frontText);
  expect(updated.backText.split("<h3>How our project does it</h3>")[1]).toBe(original.backText.split("<h3>How our project does it</h3>")[1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/portfolio-uv-answer-${testInfo.project.name}.png`, fullPage: true });
  const personal = await page.evaluate(async ({ old, unwrapId }) => {
    const { normalizeState } = await import("/src/lib/model.js");
    const edited = structuredClone(old);
    edited.cards.find((card) => card.id === unwrapId).backText = "My personal UV explanation";
    const kept = normalizeState({ sets: [edited] }).sets[0].cards.find((card) => card.id === unwrapId).backText;
    edited.cards = edited.cards.filter((card) => card.id !== unwrapId);
    const deleted = !normalizeState({ sets: [edited] }).sets[0].cards.some((card) => card.id === unwrapId);
    return { kept, deleted };
  }, { old, unwrapId });
  expect(personal).toEqual({ kept: "My personal UV explanation", deleted: true });
});

test("cloud UV answer upgrades once without resetting study progress", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async ({ deck, oldBack, unwrapId }) => {
    const { withStudySets } = await import("/src/lib/study-sets.js");
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    let local = withStudySets({ sets: [], activeSetId: null });
    const old = structuredClone(local);
    const set = old.sets.find((set) => set.id === deck.id);
    set.studyContentVersion = 3;
    set.cards.find((card) => card.id === unwrapId).backText = oldBack;
    set.progress[unwrapId] = "yellow";
    let row = { version: 40, state: old }, writes = 0;
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
      cache: { getItem: () => null, setItem: () => {} } });
    await sync.sync(); await sync.sync(); sync.stop();
    const saved = row.state.sets.find((set) => set.id === deck.id);
    return { writes, version: saved.studyContentVersion, rating: saved.progress[unwrapId],
      back: saved.cards.find((card) => card.id === unwrapId).backText };
  }, { deck, oldBack: corrections[unwrapId].backText, unwrapId });
  expect(result.writes).toBe(1);
  expect(result.version).toBe(deck.studyContentVersion);
  expect(result.rating).toBe("yellow");
  expect(result.back).toBe(deck.cards.find((card) => card.id === unwrapId).backText);
});

test("lighting question is self-contained and migrates without changing its answer or rating", async ({ page }, testInfo) => {
  const old = structuredClone(deck);
  old.studyContentVersion = 2;
  const light = old.cards.find((card) => card.id === lightingId);
  light.frontText = corrections[lightingId].frontText;
  old.progress[lightingId] = "yellow";
  await page.addInitScript(({ key, old }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      sets: [old], activeSetId: old.id,
      installedStudySets: ["android-midterm-fall-2026", old.id],
    }));
  }, { key, old });
  await ready(page);
  await page.getByRole("button", { name: deck.name, exact: true }).click();
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await page.getByLabel("Search questions and answers").fill("Which light types are used");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  await expect(page.locator(".answer-sheet-front")).toContainText("Which light types are used in my Ferris-wheel demo, and what does each one do?");
  await expect(page.locator(".answer-sheet-back")).toContainText("Directional light models sunlight");
  await page.screenshot({ path: `test-results/portfolio-lighting-${testInfo.project.name}.png`, fullPage: true });
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).sets[0], key);
  expect(saved.studyContentVersion).toBe(deck.studyContentVersion);
  expect(saved.cards.find((card) => card.id === lightingId).backText).toBe(light.backText);
  expect(saved.progress[lightingId]).toBe("yellow");
  const personal = await page.evaluate(async ({ old, lightingId }) => {
    const { normalizeState } = await import("/src/lib/model.js");
    const edited = structuredClone(old);
    const card = edited.cards.find((card) => card.id === lightingId);
    card.frontText = "My own lighting question";
    card.backText = "My own lighting notes";
    card.sectionId = "";
    const updated = normalizeState({ sets: [edited] }).sets[0];
    edited.cards = edited.cards.filter((card) => card.id !== lightingId);
    const deleted = normalizeState({ sets: [edited] }).sets[0];
    return { card: updated.cards.find((card) => card.id === lightingId),
      deleted: !deleted.cards.some((card) => card.id === lightingId) };
  }, { old, lightingId });
  expect(personal.card.frontText).toBe("My own lighting question");
  expect(personal.card.backText).toBe("My own lighting notes");
  expect(personal.card.sectionId).toBe("");
  expect(personal.deleted).toBe(true);
});

test("cloud lighting front upgrades once without replacing a personal answer", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async ({ deck, oldFront, lightingId }) => {
    const { withStudySets } = await import("/src/lib/study-sets.js");
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    let local = withStudySets({ sets: [], activeSetId: null });
    const old = structuredClone(local);
    const set = old.sets.find((set) => set.id === deck.id);
    set.studyContentVersion = 2;
    const card = set.cards.find((card) => card.id === lightingId);
    card.frontText = oldFront;
    card.backText = "My personal lighting explanation";
    set.progress[lightingId] = "green";
    let row = { version: 30, state: old }, writes = 0;
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
      cache: { getItem: () => null, setItem: () => {} } });
    await sync.sync(); await sync.sync(); sync.stop();
    const saved = row.state.sets.find((set) => set.id === deck.id);
    return { writes, version: saved.studyContentVersion, rating: saved.progress[lightingId],
      card: saved.cards.find((card) => card.id === lightingId) };
  }, { deck, oldFront: corrections[lightingId].frontText, lightingId });
  expect(result.writes).toBe(1);
  expect(result.version).toBe(deck.studyContentVersion);
  expect(result.rating).toBe("green");
  expect(result.card.frontText).toBe(deck.cards.find((card) => card.id === lightingId).frontText);
  expect(result.card.backText).toBe("My personal lighting explanation");
});

test("normal-map wording updates saved decks without changing ratings, edits or deleted cards", async ({ page }, testInfo) => {
  const old = structuredClone(deck);
  old.studyContentVersion = 1;
  old.cards.find((card) => card.id === normalMapId).backText = corrections[normalMapId].backText;
  old.progress[normalMapId] = "green";
  old.cards[1].backText = "My own gondola explanation";
  old.cards[1].sectionId = "";
  old.cards.splice(2, 1);
  await page.addInitScript(({ key, old }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      sets: [old], activeSetId: old.id,
      installedStudySets: ["android-midterm-fall-2026", old.id],
    }));
  }, { key, old });
  await ready(page);
  await page.getByRole("button", { name: deck.name, exact: true }).click();
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await page.getByLabel("Search questions and answers").fill("What does a normal map change?");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  await expect(page.locator(".answer-sheet-back")).toContainText("A normal map changes the surface normals used for lighting without changing the geometry.");
  await expect(page.locator(".answer-sheet-back")).toContainText("In my project, it makes the cabin walls look like ridged metal by changing their shading and highlights.");
  await page.screenshot({ path: `test-results/portfolio-normal-map-${testInfo.project.name}.png`, fullPage: true });
  await page.reload();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).sets[0], key);
  expect(saved.studyContentVersion).toBe(deck.studyContentVersion);
  expect(saved.cards).toHaveLength(45);
  expect(saved.progress[normalMapId]).toBe("green");
  expect(saved.cards[1].backText).toBe("My own gondola explanation");
  expect(saved.cards[1].sectionId).toBe("");
  const edited = await page.evaluate(async ({ old, normalMapId }) => {
    const { normalizeState } = await import("/src/lib/model.js");
    const value = structuredClone(old);
    value.cards.find((card) => card.id === normalMapId).backText = "My personal normal-map notes";
    return normalizeState({ sets: [value] }).sets[0];
  }, { old, normalMapId });
  expect(edited.cards.find((card) => card.id === normalMapId).backText).toBe("My personal normal-map notes");
});

test("existing cloud normal-map answer upgrades once and keeps mastered progress", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async ({ deck, oldBack, normalMapId }) => {
    const { withStudySets } = await import("/src/lib/study-sets.js");
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    let local = withStudySets({ sets: [], activeSetId: null });
    const old = structuredClone(local);
    const set = old.sets.find((set) => set.id === deck.id);
    set.studyContentVersion = 1;
    set.cards.find((card) => card.id === normalMapId).backText = oldBack;
    set.progress[normalMapId] = "green";
    let row = { version: 10, state: old }, writes = 0;
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
      cache: { getItem: () => null, setItem: () => {} } });
    await sync.sync(); await sync.sync(); sync.stop();
    const saved = row.state.sets.find((set) => set.id === deck.id);
    return { writes, version: saved.studyContentVersion, rating: saved.progress[normalMapId],
      back: saved.cards.find((card) => card.id === normalMapId).backText };
  }, { deck, oldBack: corrections[normalMapId].backText, normalMapId });
  expect(result.writes).toBe(1);
  expect(result.version).toBe(deck.studyContentVersion);
  expect(result.rating).toBe("green");
  expect(result.back).toBe(deck.cards.find((card) => card.id === normalMapId).backText);
});

test("portfolio has all guide questions plus a highlighted summary first in each demo", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  const set = saved.sets.find((set) => set.id === deck.id);
  expect(set.cards).toHaveLength(46);
  expect(set.sections).toHaveLength(4);
  expect(set.cards.filter((card) => card.guideQuestion)).toHaveLength(42);
  expect(new Set(set.cards.map((card) => card.id)).size).toBe(46);
  expect(set.sections.map((section) => {
    const cards = set.cards.filter((card) => card.sectionId === section.id);
    expect(cards[0].summaryCard).toBe(true);
    expect(cards[0].backText).toContain("<strong>");
    expect(cards.slice(1).every((card) => card.backText.includes("Short quiz answer") &&
      card.backText.includes("Understand the idea") && card.backText.includes("<strong>"))).toBe(true);
    return cards.length;
  })).toEqual([9, 14, 13, 10]);
  expect(Object.values(set.progress).every((rating) => rating === "red")).toBe(true);
  expect(backup.sets[0]).toEqual(deck);
  await page.getByRole("button", { name: deck.name, exact: true }).click();
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await expect(page.locator(".answer-sheet-card")).toHaveCount(46);
  await page.getByLabel("Search questions and answers").fill("Where and how do forces run?");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  await expect(page.locator(".answer-sheet-back")).toContainText("four physics substeps");
  await expect(page.locator(".answer-sheet-back")).toContainText("velocity");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/portfolio-answers-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("ordered portfolio study starts with summary, scrolls long answers, then unlocks next demo", async ({ page }, testInfo) => {
  await ready(page);
  const card = page.locator(".deck-card").filter({ hasText: deck.name });
  await card.getByRole("button", { name: "Study set" }).click();
  await page.getByRole("button", { name: "Start studying", exact: true }).click();
  await expect(page.locator(".flashcard")).toContainText("What was Demo 1 about?");
  await expect(page.locator(".study-section-context > strong")).toContainText("Section 1 of 4");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.locator(".answer-content strong").first()).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".answer-scroll-hint")).toBeVisible();
    await page.getByLabel("Answer; scroll for full content").press("End");
  }
  await page.screenshot({ path: `test-results/portfolio-summary-${testInfo.project.name}.png`, fullPage: true });
  await page.locator(".rating-button.green").click();
  await expect(page.locator(".flashcard")).toContainText("How do the gondolas remain level?");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  const overflow = await page.locator(".answer-content").evaluate((el) => el.scrollHeight > el.clientHeight + 2);
  if (overflow) {
    await expect(page.locator(".answer-scroll-hint")).toBeVisible();
    await page.getByLabel("Answer; scroll for full content").press("End");
  } else {
    await expect(page.locator(".answer-scroll-hint")).toHaveCount(0);
    await page.locator(".answer-content").getByText(/Source: personalized QUIZ_GUIDE/).scrollIntoViewIfNeeded();
  }
  await expect(page.locator(".answer-content").getByText(/Source: personalized QUIZ_GUIDE/)).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/portfolio-study-${testInfo.project.name}.png`, fullPage: true });
  await page.locator(".rating-button.green").click();
  for (let i = 0; i < 7; i++) {
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await page.locator(".rating-button.green").click();
  }
  await expect(page.locator(".flashcard")).toContainText("What was Demo 2 about?");
  await expect(page.locator(".study-section-context > strong")).toContainText("Section 2 of 4");
});

test("one-time portfolio installation preserves existing edits, ratings, assignments and deletions", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async (deck) => {
    const { withStudySets, withPortfolioSet } = await import("/src/lib/study-sets.js");
    const { normalizeState } = await import("/src/lib/model.js");
    const personal = { id: "personal", name: "My notes", color: "gold",
      cards: [{ id: "mine", frontText: "My question", backText: "My answer", sectionId: "" }],
      progress: { mine: "green" }, sections: [] };
    const original = { sets: [personal], activeSetId: personal.id,
      installedStudySets: ["android-midterm-fall-2026"] };
    const untouched = JSON.stringify(original);
    const installed = withStudySets(original);
    const preserved = JSON.stringify(installed.sets[0]) === JSON.stringify(normalizeState(original).sets[0]);
    const existing = structuredClone(deck);
    existing.cards[1].backText = "My own explanation";
    existing.cards[1].sectionId = "";
    existing.progress[existing.cards[1].id] = "green";
    existing.cards.splice(2, 1);
    const edited = withPortfolioSet({ sets: [existing], activeSetId: deck.id, installedStudySets: [] });
    const twice = withStudySets(installed);
    const removed = { ...installed, sets: installed.sets.filter((set) => set.id !== deck.id) };
    return { preserved, originalUnchanged: JSON.stringify(original) === untouched,
      active: installed.activeSetId, count: twice.sets.length,
      removedStaysRemoved: !withStudySets(removed).sets.some((set) => set.id === deck.id),
      edit: edited.sets[0].cards[1], rating: edited.sets[0].progress[existing.cards[1].id],
      editedCount: edited.sets[0].cards.length };
  }, deck);
  expect(result).toMatchObject({ preserved: true, originalUnchanged: true, active: "personal",
    count: 2, removedStaysRemoved: true, rating: "green", editedCount: 45 });
  expect(result.edit.backText).toBe("My own explanation");
  expect(result.edit.sectionId).toBe("");
});

test("existing cloud account receives portfolio once and new devices preserve mastery and deletion", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async (deck) => {
    const { withMidtermSet } = await import("/src/lib/midterm.js");
    const { withStudySets } = await import("/src/lib/study-sets.js");
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    let local = withMidtermSet({ sets: [], activeSetId: null });
    const old = structuredClone(local);
    old.sets[0].progress[old.sets[0].cards[0].id] = "green";
    old.sets[0].cards[1].backText = "My Android notes";
    let row = { version: 1, state: old }, writes = 0;
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(row) }) }) }) }),
      rpc: async (_name, args) => {
        writes++;
        if (args.expected_version !== row.version) return { error: { code: "40001" } };
        row = { state: structuredClone(args.next_state), version: row.version + 1 };
        return { data: structuredClone(row) };
      },
    };
    const connect = () => new CloudSync({ client, userId: "user", getState: () => local,
      onState: (value) => { local = value; }, onStatus: () => {},
      cache: { getItem: () => null, setItem: () => {} } });
    let sync = connect();
    await sync.sync(); await sync.sync(); sync.stop();
    const installed = { writes, count: row.state.sets.filter((set) => set.id === deck.id).length,
      androidRating: row.state.sets[0].progress[row.state.sets[0].cards[0].id],
      androidEdit: row.state.sets[0].cards[1].backText };
    const cardId = deck.cards[0].id;
    row.state.sets.find((set) => set.id === deck.id).progress[cardId] = "green";
    row.version++;
    local = withStudySets({ sets: [], activeSetId: null });
    sync = connect(); await sync.sync(); sync.stop();
    const download = { writes, rating: local.sets.find((set) => set.id === deck.id).progress[cardId] };
    row.state.sets = row.state.sets.filter((set) => set.id !== deck.id);
    row.version++;
    local = withStudySets({ sets: [], activeSetId: null });
    sync = connect(); await sync.sync(); sync.stop();
    return { installed, download, deleted: !local.sets.some((set) => set.id === deck.id), writes };
  }, deck);
  expect(result.installed).toEqual({ writes: 1, count: 1, androidRating: "green", androidEdit: "My Android notes" });
  expect(result.download).toEqual({ writes: 1, rating: "green" });
  expect(result.deleted).toBe(true);
  expect(result.writes).toBe(1);
});

test("transferable portfolio backup imports all four sections without replacing unrelated sets", async ({ page }) => {
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      sets: [{ id: "mine", name: "Personal deck", cards: [{ id: "mine-card", frontText: "Q", backText: "A" }],
        progress: { "mine-card": "green" } }], activeSetId: "mine",
      installedStudySets: ["android-midterm-fall-2026", "vr-portfolio-1-fall-2026"],
    }));
  }, key);
  await ready(page);
  await page.locator(".topbar input[type=file]").setInputFiles({
    name: "vr-portfolio-1.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("button", { name: deck.name, exact: true })).toBeVisible();
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
  await page.reload();
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(state.sets.find((set) => set.id === deck.id).cards).toHaveLength(46);
  expect(state.sets.find((set) => set.id === deck.id).sections).toHaveLength(4);
  expect(state.sets.find((set) => set.id === "mine").progress["mine-card"]).toBe("green");
});
