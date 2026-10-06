import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(new URL("../src/data/android-midterm.json", import.meta.url), "utf8"));
const exercises = seed.cards.filter((card) => card.practiceExercise);

test("four XML exercises follow the review question, show diagrams, and have valid solutions", async ({ page }, testInfo) => {
  await page.route("https://daguilar2023.github.io/flashcards/study-images/*.png", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    await route.fulfill({ path: `public/study-images/${name}`, contentType: "image/png" });
  });
  await page.goto("/#/browse");
  await page.getByRole("button", { name: "All questions & answers", exact: true }).click();
  await page.getByLabel("Search questions and answers").fill("XML practice —");
  await expect(page.locator(".answer-sheet-card")).toHaveCount(4);
  const check = await page.evaluate((seed) => {
    const anchor = seed.cards.findIndex((card) => card.id === "android-midterm-2026-060");
    return { order: seed.cards.slice(anchor + 1, anchor + 5).map((card) => card.id),
      solutions: [...document.querySelectorAll(".answer-sheet-back pre code")].map((code) => {
        const doc = new DOMParser().parseFromString(code.textContent, "application/xml");
        const android = "http://schemas.android.com/apk/res/android";
        const app = "http://schemas.android.com/apk/res-auto";
        const children = [...doc.querySelectorAll("Button, TextView, EditText")];
        const ids = children.map((child) => child.getAttributeNS(android, "id"));
        return { error: !!doc.querySelector("parsererror"), root: doc.documentElement.tagName,
          dimensions: children.every((child) => child.hasAttributeNS(android, "layout_width") && child.hasAttributeNS(android, "layout_height")),
          references: children.flatMap((child) => [...child.attributes])
            .filter((attr) => attr.namespaceURI === app && attr.value.startsWith("@id/"))
            .every((attr) => ids.includes(attr.value.replace("@id/", "@+id/"))),
        };
      }),
    };
  }, seed);
  expect(check.order).toEqual(exercises.map((card) => card.id));
  expect(check.solutions.map((s) => s.root)).toEqual(["LinearLayout", "LinearLayout",
    "androidx.constraintlayout.widget.ConstraintLayout", "androidx.constraintlayout.widget.ConstraintLayout"]);
  expect(check.solutions.every((s) => !s.error && s.dimensions && s.references)).toBe(true);
  for (const image of await page.locator(".answer-sheet-front img").all()) {
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator(".answer-sheet-back").nth(1)).toContainText('android:layout_weight="1"');
  await expect(page.locator(".answer-sheet-back").nth(3)).toContainText('android:layout_width="0dp"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/layout-practice-${testInfo.project.name}.png`, fullPage: true });
});

test("existing synced set gains four red exercises once without resetting progress or restoring deletions", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async ({ seed, exercises }) => {
    const { CloudSync } = await import("/src/lib/cloud-sync.js");
    const { normalizeState } = await import("/src/lib/model.js");
    const old = structuredClone(seed);
    old.studyContentVersion = 2;
    delete old.layoutPracticeVersion;
    old.cards = old.cards.filter((card) => !card.practiceExercise && !card.id.endsWith("-007"));
    old.progress = { "android-midterm-2026-060": "green", "android-midterm-2026-003": "yellow" };
    old.cards.find((card) => card.id.endsWith("-060")).backText = "My own layout notes";
    let row = { version: 50, state: { sets: [old], installedStudySets: [seed.id], activeSetId: seed.id } };
    let local = normalizeState(structuredClone(row.state)), writes = 0;
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(row) }) }) }) }),
      rpc: async (_name, args) => { writes++; row = { state: args.next_state, version: row.version + 1 }; return { data: structuredClone(row) }; },
    };
    const sync = new CloudSync({ client, userId: "user", getState: () => local,
      onState: (value) => { local = value; }, onStatus: () => {},
      cache: { getItem: () => null, setItem: () => {} },
    });
    await sync.sync(); await sync.sync(); sync.stop();
    const set = row.state.sets[0];
    const anchor = set.cards.findIndex((card) => card.id.endsWith("-060"));
    const installed = set.cards.slice(anchor + 1, anchor + 5).map((card) => card.id);
    const firstPractice = exercises[0].id;
    set.cards = set.cards.filter((card) => card.id !== firstPractice);
    const refreshed = normalizeState(row.state).sets[0];
    return { writes, installed, red: exercises.every((card) => set.progress[card.id] === "red"),
      anchorColor: set.progress["android-midterm-2026-060"], otherColor: set.progress["android-midterm-2026-003"],
      note: set.cards.find((card) => card.id.endsWith("-060")).backText,
      removedReminder: set.cards.some((card) => card.id.endsWith("-007")),
      resurrectedPractice: refreshed.cards.some((card) => card.id === firstPractice),
    };
  }, { seed, exercises });
  expect(result).toEqual({ writes: 1, installed: exercises.map((card) => card.id), red: true,
    anchorColor: "green", otherColor: "yellow", note: "My own layout notes",
    removedReminder: false, resurrectedPractice: false });
});
