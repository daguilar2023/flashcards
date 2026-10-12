import portfolio from "../data/vr-portfolio-1.json";
import originals from "../data/portfolio-content-corrections.json";

// Update unchanged bundled wording only. Never restore removed cards or
// overwrite personal answers, section choices, images or study ratings.
export function correctPortfolioContent(set) {
  if (set.id !== portfolio.id || set.studyContentVersion >= portfolio.studyContentVersion) return set;
  return {
    ...set,
    studyContentVersion: portfolio.studyContentVersion,
    cards: set.cards.map((card) => {
      const original = originals[card.id];
      if (!original) return card;
      const replacement = portfolio.cards.find((item) => item.id === card.id);
      const corrected = { ...card };
      for (const field of ["frontText", "backText"]) {
        if (typeof original[field] === "string" && card[field] === original[field]) {
          corrected[field] = replacement[field];
        }
      }
      return corrected;
    }),
  };
}
