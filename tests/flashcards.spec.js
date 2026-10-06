import { test, expect } from "@playwright/test";

// Keep the original small demo fixture for the existing workflow regressions.
// Separate midterm tests exercise the populated default and its installation.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("flashcards_app_v1")) return;
    localStorage.setItem("flashcards_app_v1", JSON.stringify({
      sets: [{
        id: "demo", name: "A little bit of everything", color: "clay",
        cards: [
          { id: "demo-1", frontText: "What is the capital of Spain?", backText: "Madrid" },
          { id: "demo-2", frontText: "What is the derivative of sin(x)?", backText: "cos(x)" },
          { id: "demo-3", frontText: "What is the time complexity of binary search?", backText: "O(log n)" },
        ], progress: {},
      }], activeSetId: "demo", installedStudySets: ["android-midterm-fall-2026"],
    }));
  });
});

async function ready(page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good things take practice." }),
  ).toBeVisible();
}
async function createSet(page, name) {
  await page
    .locator(".overview-heading")
    .getByRole("button", { name: "Create a set" })
    .click();
  await page.getByLabel("Set name", { exact: true }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create set", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function addCard(page, front, back) {
  await page
    .getByRole("textbox", { name: "Front text", exact: true })
    .fill(front);
  await page
    .getByRole("textbox", { name: "Back text", exact: true })
    .fill(back);
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.locator(".card-list")).toContainText(front);
}
const legacy = {
  sets: [
    {
      id: "old-set",
      name: "Older backup",
      cards: [
        { id: "a", frontText: "First question", backText: "First answer" },
        { id: "b", frontText: "Second question", backText: "Second answer" },
      ],
    },
  ],
  activeSetId: "old-set",
};
async function importBackup(page, value) {
  await page
    .locator(".topbar input[type=file]")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
}

test("dashboard renders without overflow or runtime errors", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await expect(page.locator(".deck-card")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("create, type, edit, cancel, delete and undo a card", async ({ page }) => {
  await ready(page);
  await createSet(page, "Biology");
  await page
    .getByRole("textbox", { name: "Front text", exact: true })
    .pressSequentially("What is DNA?");
  await expect(
    page.getByRole("textbox", { name: "Front text", exact: true }),
  ).toHaveText("What is DNA?");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Add an answer");
  await page
    .getByRole("textbox", { name: "Back text", exact: true })
    .fill("Genetic information");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page.locator(".card-list-select").click();
  await page
    .getByRole("textbox", { name: "Back text", exact: true })
    .fill("Deoxyribonucleic acid");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".card-list")).toContainText(
    "Deoxyribonucleic acid",
  );
  await page.locator(".card-list-select").click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Front text", exact: true }),
  ).toBeEmpty();
  await page
    .getByRole("button", { name: "Delete card 1", exact: true })
    .click();
  await expect(page.locator(".card-list-item")).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".card-list-item")).toHaveCount(1);
  await expect(page.locator(".local-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator(".card-list")).toContainText(
    "Deoxyribonucleic acid",
  );
});

test("code insertion stays in the chosen side without submitting the card", async ({
  page,
}) => {
  await ready(page);
  await createSet(page, "Code");
  await page
    .getByRole("textbox", { name: "Front text", exact: true })
    .fill("Print a greeting");
  await page.getByRole("button", { name: "Back insert code block" }).click();
  await page
    .getByRole("textbox", { name: "Code", exact: true })
    .fill('console.log("hello");');
  await page.getByRole("button", { name: "Insert code", exact: true }).click();
  await expect(page.locator(".card-list-item")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Back text", exact: true }),
  ).toContainText("console.log");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await page
    .locator(".set-tabs")
    .getByRole("link", { name: "Browse cards" })
    .click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.locator(".flashcard pre code")).toContainText(
    'console.log("hello");',
  );
});

test("study reveals answers, advances through piles, finishes and undoes", async ({
  page,
}) => {
  await ready(page);
  await importBackup(page, legacy);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Study", exact: true })
    .click();
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page.locator(".rating-button.green")).toBeDisabled();
  await expect(page.locator(".flashcard")).toContainText("First question");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.locator(".flashcard")).toContainText("First answer");
  await page.locator(".rating-button.yellow").click();
  await expect(page.locator(".flashcard")).toContainText("Second question");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.locator(".rating-button.green").click();
  await expect(page.locator(".flashcard")).toContainText("First question");
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.locator(".rating-button.green").click();
  await expect(
    page.getByRole("heading", { name: "You made it stick." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo last rating" }).click();
  await expect(page.locator(".flashcard")).toContainText("First answer");
  await page.locator(".rating-button.green").click();
  await expect(page.locator(".local-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByText("100% mastered", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Practice again", exact: true })
    .click();
  await expect(page.locator(".flashcard")).toContainText("First question");
  await expect(page.getByText("0% mastered", { exact: true })).toBeVisible();
});

test("switching to a shorter set resets browsing and draft state", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Browse cards" })
    .click();
  await page.getByRole("button", { name: "Next card" }).click();
  await page.getByRole("button", { name: "Next card" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Overview" })
    .click();
  await createSet(page, "Short set");
  await addCard(page, "One question", "One answer");
  await page
    .locator(".set-tabs")
    .getByRole("link", { name: "Browse cards" })
    .click();
  await expect(page.locator(".flashcard")).toContainText("One question");
  await expect(page.getByText("Card 1 of 1", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("legacy imports merge, malformed imports leave data intact, and HTML is sanitized", async ({
  page,
}) => {
  await ready(page);
  await importBackup(page, legacy);
  await expect(page.locator(".deck-card")).toHaveCount(2);
  await importBackup(page, {
    sets: [{ id: "invalid", name: "Missing cards" }],
  });
  await expect(page.getByRole("status")).toContainText("invalid");
  await expect(page.locator(".deck-card")).toHaveCount(2);
  const unsafe = {
    sets: [
      {
        id: "unsafe",
        name: "Safe content",
        cards: [
          {
            id: "unsafe-card",
            frontText:
              '<p>Safe question</p><script>window.injected=true</script><img src="x" onerror="window.injected=true">',
            backText: '<a href="javascript:alert(1)">Answer</a>',
          },
        ],
      },
    ],
  };
  await importBackup(page, unsafe);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Browse cards" })
    .click();
  await expect(page.locator(".flashcard")).toContainText("Safe question");
  expect(
    await page
      .locator(
        '.flashcard script, .flashcard [onerror], .flashcard [href^="javascript:"]',
      )
      .count(),
  ).toBe(0);
  await page.getByRole("button", { name: "Reveal answer" }).click();
  expect(await page.locator('.flashcard [href^="javascript:"]').count()).toBe(
    0,
  );
});

test("IndexedDB failure falls back to an existing local backup", async ({
  page,
}) => {
  await page.addInitScript((value) => {
    localStorage.setItem("flashcards_app_v1", JSON.stringify(value));
    IDBFactory.prototype.open = () => {
      throw new Error("Database unavailable for this test");
    };
  }, legacy);
  await ready(page);
  await expect(page.locator(".deck-card").filter({ hasText: "Older backup" })).toBeVisible();
  await expect(page.locator(".local-status")).toContainText(
    "Saved in browser backup",
  );
});

test("random traversal avoids immediately repeating a card and exhausted piles return null", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { nextCard } = await import("/src/lib/model.js");
    const cards = [{ id: "a" }, { id: "b" }, { id: "c" }];
    return [
      nextCard(cards, {}, "a", "random", "all", () => 0),
      nextCard(cards, { a: "green", b: "green", c: "green" }, "a"),
      nextCard(cards, {}, "a", "ordered", "yellow"),
    ];
  });
  expect(result).toEqual(["b", null, null]);
});

test("images persist, and browsing and studying fit a narrow screen", async ({
  page,
}, testInfo) => {
  await ready(page);
  await createSet(page, "Pictures");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jIuoAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator(".editor-side")
    .first()
    .locator("input[type=file]")
    .setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: png });
  await page
    .getByRole("textbox", { name: "Back text", exact: true })
    .fill("An image answer");
  await expect(page.getByRole("img", { name: "Front preview" })).toBeVisible();
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".set-tabs")
    .getByRole("link", { name: "Browse cards" })
    .click();
  await expect(
    page.getByRole("img", { name: "Question illustration" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".set-tabs")
    .getByRole("link", { name: "Study", exact: true })
    .click();
  await page.getByRole("button", { name: "Start studying" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/study-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("unfinished drafts are kept when switching sets", async ({ page }) => {
  await ready(page);
  await createSet(page, "Draft set");
  await page
    .getByRole("textbox", { name: "Front text", exact: true })
    .fill("Unfinished question");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Overview" })
    .click();
  await page.locator(".deck-title").filter({ hasText: "A little bit" }).click();
  await page
    .locator(".set-tabs")
    .getByRole("link", { name: "Card editor" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Front text", exact: true }),
  ).toBeEmpty();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Overview" })
    .click();
  await page.locator(".deck-title").filter({ hasText: "Draft set" }).click();
  await page
    .locator(".set-tabs")
    .getByRole("link", { name: "Card editor" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Front text", exact: true }),
  ).toHaveText("Unfinished question");
});

test("unreadable saved data is preserved instead of overwritten", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("flashcards_app_v1", "{invalid-json"),
  );
  await ready(page);
  await expect(page.getByRole("alert")).toContainText(
    "Saved data could not be read",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("flashcards_app_v1")),
  ).toBe("{invalid-json");
});

test("keyboard ratings work after revealing an answer with the mouse", async ({
  page,
}) => {
  await ready(page);
  await importBackup(page, legacy);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Study", exact: true })
    .click();
  await page.getByRole("button", { name: "Start studying" }).click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.keyboard.press("3");
  await expect(page.locator(".flashcard")).toContainText("Second question");
  await expect(page.getByText("50% mastered", { exact: true })).toBeVisible();
});
