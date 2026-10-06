import DOMPurify from "dompurify";

export const COLORS = ["clay", "sage", "blue", "gold"];
export const uid = () => crypto.randomUUID();
export const emptyCard = () => ({
  id: uid(),
  frontText: "",
  backText: "",
  frontImage: "",
  backImage: "",
});
export const sanitize = (html = "") =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "div",
      "br",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "pre",
      "code",
      "span",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "a",
      "img",
    ],
    ALLOWED_ATTR: ["class", "href", "src", "alt"],
    ALLOW_DATA_ATTR: false,
  });
export function plainText(html = "") {
  const el = document.createElement("div");
  el.innerHTML = sanitize(html);
  return (el.textContent || "").trim();
}
export const hasContent = (html) =>
  !!plainText(html) || /<img\s/i.test(sanitize(html));
export function safeImage(value) {
  return typeof value === "string" &&
    /^(data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,|https?:\/\/)/i.test(
      value,
    )
    ? value
    : "";
}
export function normalizeState(value) {
  if (!value || !Array.isArray(value.sets))
    throw new Error("Choose a flashcards JSON backup containing a sets array.");
  const setIds = new Set();
  const cardIds = new Set();
  const sets = value.sets.map((set, index) => {
    if (
      !set ||
      typeof set.id !== "string" ||
      !set.id ||
      typeof set.name !== "string" ||
      !set.name.trim() ||
      !Array.isArray(set.cards) ||
      setIds.has(set.id)
    )
      throw new Error("The backup contains an invalid or duplicate set.");
    setIds.add(set.id);
    const cards = set.cards.map((card) => {
      if (
        !card ||
        typeof card.id !== "string" ||
        !card.id ||
        cardIds.has(card.id)
      )
        throw new Error("The backup contains an invalid or duplicate card.");
      cardIds.add(card.id);
      for (const key of ["frontText", "backText", "frontImage", "backImage"]) {
        if (card[key] !== undefined && typeof card[key] !== "string")
          throw new Error("Card text and images must be strings.");
      }
      return {
        ...emptyCard(),
        ...card,
        frontText: sanitize(card.frontText),
        backText: sanitize(card.backText),
        frontImage: safeImage(card.frontImage),
        backImage: safeImage(card.backImage),
      };
    });
    const progress = Object.fromEntries(
      cards.map((card) => [
        card.id,
        ["red", "yellow", "green"].includes(set.progress?.[card.id])
          ? set.progress[card.id]
          : "red",
      ]),
    );
    return {
      ...set,
      name: set.name.trim().slice(0, 100),
      cards,
      progress,
      color: COLORS.includes(set.color)
        ? set.color
        : COLORS[index % COLORS.length],
    };
  });
  return {
    sets,
    syncAccountId: typeof value.syncAccountId === "string" ? value.syncAccountId : undefined,
    installedStudySets: Array.isArray(value.installedStudySets)
      ? [...new Set(value.installedStudySets.filter((id) => typeof id === "string"))]
      : [],
    activeSetId: sets.some((set) => set.id === value.activeSetId)
      ? value.activeSetId
      : (sets[0]?.id ?? null),
  };
}
export function counts(set) {
  return (set?.cards || []).reduce(
    (result, card) => {
      result[set.progress?.[card.id] || "red"] += 1;
      return result;
    },
    { red: 0, yellow: 0, green: 0 },
  );
}
export function nextCard(
  cards,
  progress,
  currentId,
  order = "ordered",
  pile = "all",
  random = Math.random,
) {
  const eligible = cards.filter((card) =>
    pile === "all"
      ? progress[card.id] !== "green"
      : (progress[card.id] || "red") === pile,
  );
  if (!eligible.length) return null;
  const alternatives = eligible.filter((card) => card.id !== currentId);
  const pool = alternatives.length ? alternatives : eligible;
  if (order === "random") return pool[Math.floor(random() * pool.length)].id;
  const start = cards.findIndex((card) => card.id === currentId);
  for (let offset = 1; offset <= cards.length; offset++) {
    const card = cards[(start + offset) % cards.length];
    if (pool.some((candidate) => candidate.id === card.id)) return card.id;
  }
  return pool[0].id;
}
export function demoState() {
  const id = uid();
  const cards = [
    {
      ...emptyCard(),
      frontText: "What is the capital of Spain?",
      backText: "Madrid",
    },
    {
      ...emptyCard(),
      frontText: "What is the derivative of sin(x)?",
      backText: "cos(x)",
    },
    {
      ...emptyCard(),
      frontText: "What is the time complexity of binary search?",
      backText:
        "<p><strong>O(log n)</strong></p><p>Each step cuts the search space in half.</p>",
    },
  ];
  return {
    sets: [
      {
        id,
        name: "A little bit of everything",
        color: "clay",
        cards,
        progress: {},
      },
    ],
    activeSetId: id,
  };
}
