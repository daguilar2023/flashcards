import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(new URL("../src/data/android-midterm.json", import.meta.url), "utf8"));
const originals = JSON.parse(readFileSync(new URL("../src/data/midterm-content-corrections.json", import.meta.url), "utf8"));
const nav = seed.cards.filter((card) => card.topic.startsWith("8."));

async function browseNavigation(page) {
  await page.goto("/#/browse");
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await page.getByLabel("Search questions and answers").fill("8. Navigational patterns");
}

test("all navigation answers use Lecture 13, have bullets, and show readable XML and Java examples", async ({ page }, testInfo) => {
  await browseNavigation(page);
  await expect(page.locator(".answer-sheet-card")).toHaveCount(12);
  for (const answer of await page.locator(".answer-sheet-back").all()) {
    await expect(answer).toContainText("Slides: 13, IntroToNavPatterns");
    await expect(answer).not.toContainText("Supplemental");
    expect(await answer.locator("li").count()).toBeGreaterThan(0);
  }
  for (const subject of ["ViewPager2", "TabLayout", "DrawerLayout", "FloatingActionButton", "onCreateDialog", "getSupportFragmentManager"]) {
    await expect(page.locator(".all-cards-area")).toContainText(subject);
  }
  const xml = await page.evaluate(() => [...document.querySelectorAll('.answer-sheet-back code.language-xml')].map((el) => {
    const snippet = '<practice xmlns:android="http://schemas.android.com/apk/res/android" xmlns:app="http://schemas.android.com/apk/res-auto">' + el.textContent + '</practice>';
    return !new DOMParser().parseFromString(snippet, "application/xml").querySelector("parsererror");
  }));
  expect(xml.length).toBeGreaterThanOrEqual(6);
  expect(xml.every(Boolean)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("Search questions and answers").fill("these basic navigational patterns");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  await expect(page.locator(".answer-sheet-front .prompt-list li")).toHaveCount(8);
  await page.screenshot({ path: `test-results/navigation-overview-${testInfo.project.name}.png`, fullPage: true });
});

test("existing cloud navigation answers update once without resetting ratings or restoring deletions", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async ({ seed, originals, nav }) => {
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    const { normalizeState, sanitize } = await import("/src/lib/model.js");
    const old = structuredClone(seed);
    old.studyContentVersion = 4;
    for (const card of old.cards.filter((card) => card.topic.startsWith("8."))) {
      for (const field of ["frontText", "backText"]) {
        const values = originals[card.id][field];
        card[field] = Array.isArray(values) ? values.at(-1) : values;
      }
    }
    // Keep the student's removed reading reminder removed, and retain their notes.
    old.cards = old.cards.filter((card) => card.id !== "android-midterm-2026-075");
    old.cards.find((card) => card.id.endsWith("-081")).backText = "My drawer notes";
    old.cards.find((card) => card.id.endsWith("-080")).frontText = "My tab question";
    old.cards.find((card) => card.id.endsWith("-080")).sectionId = "";
    old.progress = Object.fromEntries(old.cards.map((card, i) => [card.id, ["red", "yellow", "green"][i % 3]]));
    const progressBefore = JSON.stringify(old.progress);
    const tableBefore = sanitize(old.cards.find((card) => card.id.endsWith("-061")).backText);
    let row = { version: 20, state: { sets: [old], installedStudySets: [seed.id], activeSetId: seed.id } };
    let local = normalizeState(structuredClone(row.state)), writes = 0;
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(row) }) }) }) }),
      rpc: async (_name, args) => { writes++; row = { state: args.next_state, version: row.version + 1 }; return { data: structuredClone(row) }; },
    };
    const sync = new CloudSync({ client, userId: "user", getState: () => local,
      onState: (state) => { local = state; }, onStatus: () => {}, cache: { getItem: () => null, setItem: () => {} } });
    await sync.sync(); await sync.sync(); sync.stop();
    const set = row.state.sets[0];
    const installed = set.cards.filter((card) => card.topic.startsWith("8."));
    const tab = set.cards.find((card) => card.id.endsWith("-080"));
    return { writes, cards: set.cards.length, navigation: installed.length, version: set.studyContentVersion,
      ratingsRetained: JSON.stringify(set.progress) === progressBefore,
      updated: installed.filter((card) => !card.id.endsWith("-081")).every((card) => card.backText === sanitize(nav.find((c) => c.id === card.id).backText)),
      note: set.cards.find((card) => card.id.endsWith("-081")).backText,
      front: tab.frontText, assignment: tab.sectionId,
      tableRetained: set.cards.find((card) => card.id.endsWith("-061")).backText === tableBefore,
      restored: set.cards.some((card) => card.id.endsWith("-075")) };
  }, { seed, originals, nav });
  expect(result).toEqual({ writes: 1, cards: 89, navigation: 11, version: 5, ratingsRetained: true,
    updated: true, note: "My drawer notes", front: "My tab question", assignment: "", tableRetained: true, restored: false });
});

test("older navigation overview variants upgrade and new answers survive reload and editing", async ({ page }) => {
  await page.goto("/");
  const legacy = await page.evaluate(async ({ seed, originals }) => {
    const { normalizeState } = await import("/src/lib/model.js");
    const overview = structuredClone(seed.cards.find((card) => card.id.endsWith("-077")));
    overview.frontText = originals[overview.id].frontText[0];
    overview.backText = originals[overview.id].backText[0];
    const old = { ...seed, cards: [overview], studyContentVersion: 2, progress: { [overview.id]: "green" } };
    const repaired = normalizeState({ sets: [old], installedStudySets: [seed.id] }).sets[0];
    return { front: repaired.cards[0].frontText, back: repaired.cards[0].backText, rating: repaired.progress[overview.id] };
  }, { seed, originals });
  expect(legacy.front).toContain('class="prompt-list"');
  expect(legacy.back).toContain("IntroToNavPatterns");
  expect(legacy.rating).toBe("green");
  await browseNavigation(page);
  await page.getByLabel("Search questions and answers").fill("A compact version of the professor");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Back text", exact: true })).toContainText("onCreateDialog");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
  await page.reload();
  await browseNavigation(page);
  await page.getByLabel("Search questions and answers").fill("A compact version of the professor");
  await expect(page.locator(".answer-sheet-back")).toContainText("onCreateDialog");
});
