import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const midterm = JSON.parse(readFileSync(new URL("../src/data/android-midterm.json", import.meta.url), "utf8"));
const key = "flashcards_app_v1";

async function open(page, route = "/") {
  await page.goto(route === "/" ? "/" : `/#${route}`);
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
}

test("default midterm covers the review bullets plus four layout exercises in order", async ({ page }, testInfo) => {
  await open(page);
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(state.sets).toHaveLength(1);
  const set = state.sets[0];
  expect(set.id).toBe(midterm.id);
  expect(set.cards).toHaveLength(90);
  expect(set.cards.map((card) => card.id)).toEqual(midterm.cards.map((card) => card.id));
  expect(set.cards.every((card) => card.frontText && card.backText && set.progress[card.id] === "red")).toBe(true);
  expect(set.cards.reduce((groups, card) => {
    groups[card.topic[0]] = (groups[card.topic[0]] || 0) + 1;
    return groups;
  }, {})).toEqual({ 1: 6, 2: 6, 3: 7, 4: 8, 5: 24, 6: 20, 7: 7, 8: 12 });
  await page.reload();
  await expect(page.locator(".deck-card")).toHaveCount(1);
  await page.screenshot({ path: `test-results/midterm-library-${testInfo.project.name}.png`, fullPage: true });
});

test("complete question/answer view shows code and supports direct editing", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "/browse");
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await expect(page.locator(".answer-sheet-card")).toHaveCount(90);
  await page.getByLabel("Search questions and answers").fill("For Linear and Constraint layouts");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  await expect(page.locator(".answer-sheet-back pre")).toHaveCount(2);
  await expect(page.locator(".answer-sheet-back")).toContainText("layout_constraintTop_toBottomOf");
  await expect(page.locator(".answer-sheet-back .token").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/midterm-answers-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Edit card", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Back text", exact: true })).toContainText("ConstraintLayout");
  await page.getByRole("textbox", { name: "Back text", exact: true }).fill("My revised layout answer");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
  await page.reload();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(saved.sets[0].cards).toHaveLength(90);
  expect(saved.sets[0].cards.find((card) => card.backText.includes("My revised layout answer"))).toBeTruthy();
  expect(errors).toEqual([]);
});

test("ordered study uses red yellow green, supports long answers, and can switch to random", async ({ page }, testInfo) => {
  await open(page, "/learn");
  await page.getByRole("button", { name: "Start studying", exact: true }).click();
  // Clicking the body flips the card; buttons and selectable code remain independent.
  await page.locator(".flashcard .rich-content").click();
  await expect(page.locator(".flashcard")).toContainText("Lecture 1: IntroToMobileDevelopment");
  await page.locator(".rating-button.red").click();
  await expect(page.locator(".flashcard")).toContainText("most recent versions");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.locator(".rating-button.yellow").click();
  await expect(page.locator(".flashcard")).toContainText("Android system licensing");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.locator(".rating-button.green").click();
  await expect(page.locator(".flashcard")).toContainText("basic Android architecture");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.locator(".answer-content")).toContainText("Linux kernel");
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".answer-scroll-hint")).toBeVisible();
    await page.getByLabel("Answer; scroll for full content").press("End");
    await expect(page.locator(".answer-content").getByText("Linux kernel:", { exact: true })).toBeInViewport();
  }
  expect(await page.locator(".answer-content").evaluate((el) => getComputedStyle(el).textAlign)).toBe("left");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/midterm-study-${testInfo.project.name}.png`, fullPage: true });
  await page.getByLabel("Study order").selectOption("random");
  await page.locator(".rating-button.green").click();
  await expect(page.locator(".flashcard")).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(saved.sets[0].progress[midterm.cards[0].id]).toBe("red");
  expect(saved.sets[0].progress[midterm.cards[1].id]).toBe("yellow");
  expect(saved.sets[0].progress[midterm.cards[2].id]).toBe("green");
});

test("installation preserves existing sets, cards, and progress", async ({ page }) => {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({ sets: [{
      id: "personal", name: "My existing study set", color: "blue",
      cards: [{ id: "personal-card", frontText: "Existing question", backText: "Existing answer" }],
      progress: { "personal-card": "green" },
    }], activeSetId: "personal" }));
  }, key);
  await open(page);
  await expect(page.locator(".deck-card")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".deck-card")).toHaveCount(2);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  expect(saved.activeSetId).toBe("personal");
  expect(saved.sets[0].cards[0].backText).toBe("Existing answer");
  expect(saved.sets[0].progress["personal-card"]).toBe("green");
});

test("deleting the bundled set does not reinstall it on refresh", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: `Edit ${midterm.name}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete set", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete set", exact: true }).click();
  await expect(page.locator(".deck-card")).toHaveCount(0);
  await expect(page.locator(".local-status")).toContainText("Saved on this device");
  await page.reload();
  await expect(page.locator(".deck-card")).toHaveCount(0);
});

test("overview questions name their subjects and answers stand alone", async ({ page }) => {
  await open(page, "/browse");
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await page.getByLabel("Search questions and answers").fill("Describe the purpose and basic characteristics of these Android widgets");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(1);
  for (const name of ["TextView", "RadioGroup", "ProgressBar"]) {
    await expect(page.locator(".answer-sheet-front")).toContainText(name);
    await expect(page.locator(".answer-sheet-back")).toContainText(name);
  }
  await expect(page.locator(".answer-sheet-back")).toContainText("Displays text");
  await expect(page.locator(".answer-sheet-back")).toContainText("Supplemental");
  await page.getByLabel("Search questions and answers").fill("Describe the main principles governing placement");
  await expect(page.locator(".answer-sheet-front")).toContainText("ConstraintLayout");
  await page.getByLabel("Search questions and answers").fill("these basic navigational patterns");
  await expect(page.locator(".answer-sheet-back")).toContainText("Lateral moves between sibling destinations");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
