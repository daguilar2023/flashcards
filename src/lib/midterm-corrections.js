import midterm from "../data/android-midterm.json";
import originals from "../data/midterm-content-corrections.json";

// Repair only unchanged bundled text. Personal edits, removed cards, section
// assignments, and color ratings remain part of the student's saved workspace.
export function correctMidtermContent(set) {
  if (set.id !== midterm.id) return set;
  let corrected = set;
  if (!(set.studyContentVersion >= midterm.studyContentVersion)) corrected = {
    ...set, studyContentVersion: midterm.studyContentVersion,
    cards: set.cards.map((card) => {
      const old = originals[card.id];
      if (!old) return card;
      const replacement = midterm.cards.find((item) => item.id === card.id);
      const corrected = { ...card };
      for (const field of ["frontText", "backText"]) {
        const previous = Array.isArray(old[field]) ? old[field] : [old[field]];
        if (previous.includes(card[field])) corrected[field] = replacement[field];
      }
      return corrected;
    }),
  };
  if (!corrected.layoutPracticeVersion) {
    const ids = new Set(corrected.cards.map((card) => card.id));
    const additions = midterm.cards.filter((card) => card.practiceExercise && !ids.has(card.id));
    const anchor = corrected.cards.findIndex((card) => card.id === "android-midterm-2026-060");
    const cards = [...corrected.cards];
    // A deleted anchor must not recreate a topic the student removed.
    if (anchor >= 0) cards.splice(anchor + 1, 0, ...structuredClone(additions));
    corrected = { ...corrected, cards, layoutPracticeVersion: 1,
      progress: { ...corrected.progress,
        ...Object.fromEntries((anchor >= 0 ? additions : []).map((card) => [card.id, "red"])),
      },
    };
  }
  return corrected;
}
