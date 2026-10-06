import midterm from "../data/android-midterm.json";
import originals from "../data/midterm-content-corrections.json";

// Repair only unchanged bundled text. Personal edits, removed cards, section
// assignments, and color ratings remain part of the student's saved workspace.
export function correctMidtermContent(set) {
  if (set.id !== midterm.id || set.studyContentVersion >= midterm.studyContentVersion) return set;
  return { ...set, studyContentVersion: midterm.studyContentVersion,
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
}
