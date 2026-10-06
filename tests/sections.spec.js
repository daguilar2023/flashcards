import { test, expect } from "@playwright/test";

const storageKey = "flashcards_app_v1";
const fixture = {
  sets: [{ id: "sections", name: "Section study", color: "sage",
    sections: [{ id: "a", name: "Android system" }, { id: "b", name: "Events" }],
    cards: [
      { id: "a1", sectionId: "a", frontText: "Android one", backText: "Answer one" },
      { id: "b1", sectionId: "b", frontText: "Event one", backText: "Event answer" },
      { id: "a2", sectionId: "a", frontText: "Android two", backText: "Answer two" },
      { id: "other", frontText: "Unsectioned question", backText: "Unsectioned answer" },
    ], progress: { a1: "red", b1: "red", a2: "red", other: "red" },
  }], activeSetId: "sections", installedStudySets: ["android-midterm-fall-2026"],
};
async function open(page, route = "learn", value = fixture) {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value });
  await page.goto(`/#/${route}`);
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
}
async function rate(page, color) {
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.locator(`.rating-button.${color}`).click();
}
async function progress(page) {
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).sets[0].progress, storageKey);
}

test("ordered study finishes each section, then unsectioned cards, using only three piles", async ({ page }) => {
  await open(page);
  await expect(page.locator(".pile-tabs button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /To practice/ })).toHaveCount(0);
  await page.getByText("Section progress", { exact: true }).click();
  await expect(page.locator(".section-progress-list")).toContainText("Locked");
  await page.getByRole("button", { name: "Start studying", exact: true }).click();
  await expect(page.locator(".flashcard")).toContainText("Android one");
  await rate(page, "yellow");
  await expect(page.locator(".flashcard")).toContainText("Android two");
  // Keeping a card red cannot unlock the next section.
  await rate(page, "red");
  await expect(page.locator(".flashcard")).toContainText("Android two");
  await rate(page, "green");
  await expect(page.locator(".flashcard")).toContainText("Android one");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.locator(".rating-button.red")).toBeDisabled();
  await page.keyboard.press("1");
  await expect(page.locator(".flashcard")).toContainText("Answer one");
  await page.locator(".rating-button.green").click();
  await expect(page.locator(".flashcard")).toContainText("Event one");
  await expect(page.locator(".study-section-context > strong")).toContainText("Events");
  await rate(page, "green");
  await expect(page.locator(".flashcard")).toContainText("Unsectioned question");
  await rate(page, "green");
  await expect(page.getByRole("heading", { name: "You made it stick." })).toBeVisible();
  expect(Object.values(await progress(page))).toEqual(["green", "green", "green", "green"]);
  await page.getByRole("button", { name: "Undo last rating", exact: true }).click();
  await expect(page.locator(".flashcard")).toContainText("Unsectioned answer");
});

test("restart resets all sections to red, clears undo, and saves the reset", async ({ page }) => {
  const value = structuredClone(fixture);
  value.sets[0].progress = { a1: "green", a2: "yellow", b1: "green", other: "yellow" };
  await open(page, "learn", value);
  await page.getByRole("button", { name: "Restart study", exact: true }).click();
  await expect(page.locator(".flashcard")).toContainText("Android one");
  await expect(page.getByRole("button", { name: "Undo last rating", exact: true })).toHaveCount(0);
  expect(Object.values(await progress(page))).toEqual(["red", "red", "red", "red"]);
  await page.reload();
  await expect(page.getByText("0% mastered", { exact: true })).toBeVisible();
  expect(Object.values(await progress(page))).toEqual(["red", "red", "red", "red"]);
});

test("random study mixes all sections and both unfinished colors", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async (set) => {
    const { nextStudyCard } = await import("/src/lib/model.js");
    const ratings = { a1: "yellow", a2: "green", b1: "red", other: "red" };
    return [0, .5, .99].map((random) => nextStudyCard(set, ratings, null, "random", "red", () => random));
  }, fixture.sets[0]);
  expect(result.map((value) => value.currentId)).toEqual(["a1", "b1", "other"]);
  expect(result.map((value) => value.pile)).toEqual(["yellow", "red", "red"]);
  await page.getByLabel("Study order").selectOption("random");
  await expect(page.locator(".study-section-context")).toContainText("All sections · Random order");
  await page.getByRole("button", { name: "Start studying", exact: true }).click();
  await page.getByLabel("Study order").selectOption("ordered");
  await expect(page.locator(".flashcard")).toContainText("Android one");
});

test("sections can be added, renamed, reordered, removed with undo, and assigned optionally", async ({ page }) => {
  await open(page, "sets");
  await page.locator(".sections-editor summary").click();
  await page.getByLabel("New section name", { exact: true }).fill("Fragments");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await expect(page.locator(".section-edit-list li")).toHaveCount(3);
  await page.locator(".section-edit-list li").filter({ hasText: "Fragments" }).getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Section name", { exact: true }).fill("XML");
  await page.getByRole("button", { name: "Save section", exact: true }).click();
  await page.getByRole("button", { name: "Move XML earlier", exact: true }).click();
  await expect(page.locator(".section-edit-list li").nth(1)).toContainText("XML");
  await page.getByRole("button", { name: "Add a new card", exact: true }).click();
  await page.getByLabel("Card section", { exact: true }).selectOption({ label: "XML" });
  await page.getByRole("textbox", { name: "Front text", exact: true }).fill("XML question");
  await page.getByRole("textbox", { name: "Back text", exact: true }).fill("XML answer");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page.locator(".section-edit-list li").filter({ hasText: "XML" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator(".card-list-item").filter({ hasText: "XML question" })).toContainText("No section");
  await page.locator(".toast").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".card-list-item").filter({ hasText: "XML question" })).toContainText("XML");
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
  await page.reload();
  await page.locator(".sections-editor summary").click();
  await expect(page.locator(".section-edit-list li").nth(1)).toContainText("XML");
  await page.locator(".card-list-item").filter({ hasText: "XML question" }).locator(".card-list-select").click();
  await expect(page.getByLabel("Card section", { exact: true })).toHaveValue(/.+/);
  await page.getByLabel("Card section", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".card-list-item").filter({ hasText: "XML question" })).toContainText("No section");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("existing midterm upgrades once without losing edits, ratings, or optional unassignment", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { normalizeState } = await import("/src/lib/model.js");
    const old = { sets: [{ id: "android-midterm-fall-2026", name: "My edited midterm", cards: [{
      id: "android-midterm-2026-001", topic: "1. The Android system", frontText: "My question", backText: "My answer",
    }], progress: { "android-midterm-2026-001": "green" } }] };
    const migrated = normalizeState(old);
    const set = migrated.sets[0];
    const assignment = set.cards[0].sectionId;
    set.cards[0].sectionId = "";
    const reloaded = normalizeState(migrated);
    return { sections: set.sections.length, assignment, unassigned: reloaded.sets[0].cards[0].sectionId,
      answer: set.cards[0].backText, progress: set.progress[set.cards[0].id] };
  });
  expect(result).toEqual({ sections: 8, assignment: "midterm-section-1", unassigned: "", answer: "My answer", progress: "green" });
});

test("sync preserves concurrent section edits and resets every remote rating", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async (before) => {
    const { statePatch, applyPatch } = await import("/src/lib/sync-merge.js");
    const remote = structuredClone(before);
    remote.sets[0].sections.push({ id: "c", name: "Remote section" });
    remote.sets[0].progress.a1 = "green";
    remote.sets[0].progress.b1 = "yellow";
    const local = structuredClone(before);
    local.sets[0].sections[0].name = "Renamed Android";
    local.sets[0].cards[2].sectionId = "b";
    const merged = applyPatch(remote, statePatch(before, local));
    const reset = structuredClone(local);
    reset.sets[0].studyResetId = "restart-test";
    reset.sets[0].progress = Object.fromEntries(reset.sets[0].cards.map((card) => [card.id, "red"]));
    const restarted = applyPatch(merged, statePatch(local, reset));
    return { names: merged.sets[0].sections.map((section) => section.name),
      assignment: merged.sets[0].cards[2].sectionId, beforeReset: merged.sets[0].progress,
      afterReset: restarted.sets[0].progress };
  }, fixture);
  expect(result.names).toEqual(["Renamed Android", "Events", "Remote section"]);
  expect(result.assignment).toBe("b");
  expect(result.beforeReset.a1).toBe("green");
  expect(result.beforeReset.b1).toBe("yellow");
  expect(Object.values(result.afterReset)).toEqual(["red", "red", "red", "red"]);
});
