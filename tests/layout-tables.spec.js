import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(new URL("../src/data/android-midterm.json", import.meta.url), "utf8"));
const card = seed.cards.find((card) => card.id === "android-midterm-2026-061");
const key = "flashcards_app_v1";

async function openTables(page) {
  await page.goto("/#/browse");
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await page.getByLabel("Search questions and answers").fill("name the principal XML attributes");
}

test("layout tables show parent/child scope, stay within the screen, and survive editor saving", async ({ page }, testInfo) => {
  await openTables(page);
  await expect(page.locator(".attribute-table")).toHaveCount(4);
  await expect(page.locator(".attribute-table caption")).toHaveText(["LinearLayout", "FrameLayout", "TableLayout", "ConstraintLayout"]);
  const linear = page.getByRole("table", { name: "LinearLayout", exact: true });
  await expect(linear.getByRole("columnheader")).toHaveText(["Attribute name", "Applies to", "Example values", "Meaning"]);
  await expect(linear.getByRole("row").filter({ hasText: "android:weightSum" })).toContainText("Parent LinearLayout");
  await expect(linear.getByRole("row").filter({ hasText: "android:layout_weight" })).toContainText("Child view");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const region = page.getByRole("region", { name: "LinearLayout attributes; scroll sideways if needed", exact: true });
  if (testInfo.project.name === "desktop") {
    expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  if (await region.evaluate((el) => el.scrollWidth > el.clientWidth)) {
    await region.press("ArrowRight");
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  }
  await page.screenshot({ path: `test-results/layout-tables-browse-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Back text", exact: true }).locator("table")).toHaveCount(4);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
  await page.reload();
  await openTables(page);
  await expect(page.locator(".attribute-table")).toHaveCount(4);
  expect(await page.locator(".attribute-table th").first().getAttribute("scope")).toBe("col");
});

test("long table answers remain scrollable in study mode without overflowing the page", async ({ page }, testInfo) => {
  await page.addInitScript(({ seed, card, key }) => {
    if (localStorage.getItem(key)) return;
    const set = { ...seed, cards: [card], progress: { [card.id]: "yellow" } };
    localStorage.setItem(key, JSON.stringify({ sets: [set], activeSetId: seed.id, installedStudySets: [seed.id] }));
  }, { seed, card, key });
  await page.goto("/#/learn");
  await page.getByRole("button", { name: "Start studying", exact: true }).click();
  await page.getByRole("button", { name: /^Reveal answer/ }).click();
  await expect(page.locator(".answer-content table")).toHaveCount(4);
  await expect(page.locator(".answer-scroll-hint")).toBeVisible();
  expect(await page.locator(".answer-content").evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("Answer; scroll for full content").press("End");
  await expect(page.locator(".answer-content").getByText(/Source: Lecture 11/)).toBeInViewport();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(saved.sets[0].progress[card.id]).toBe("yellow");
  await page.screenshot({ path: `test-results/layout-tables-study-${testInfo.project.name}.png`, fullPage: true });
});

test("table sanitization blocks scripts and content repair preserves edited answers and deletions", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async ({ seed, card }) => {
    const { sanitize, normalizeState } = await import("/src/lib/model.js");
    const html = sanitize('<table onclick="alert(1)"><caption>Safe</caption><thead><tr><th scope="col">Attribute</th></tr></thead><tbody><tr><td><script>alert(2)</script>orientation<img src="x" onerror="alert(3)"></td></tr></tbody></table>');
    const edited = { ...structuredClone(seed), studyContentVersion: 3, cards: [{ ...card, backText: "My own table notes" }], progress: { [card.id]: "green" } };
    const normalized = normalizeState({ sets: [edited], activeSetId: seed.id, installedStudySets: [seed.id] }).sets[0];
    const deleted = normalizeState({ sets: [{ ...edited, cards: [] }], installedStudySets: [seed.id] }).sets[0];
    return { html, back: normalized.cards[0].backText, color: normalized.progress[card.id], cards: deleted.cards.length };
  }, { seed, card });
  expect(result.html).toContain('<th scope="col">');
  expect(result.html).toContain("<table>");
  expect(result.html).not.toMatch(/<script|onclick|onerror|alert\(/);
  expect(result.back).toBe("My own table notes");
  expect(result.color).toBe("green");
  expect(result.cards).toBe(0);
});
