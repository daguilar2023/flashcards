import portfolio from "../data/vr-portfolio-1.json";
import { normalizeState } from "./model";
import { withMidtermSet } from "./midterm";

export const PORTFOLIO_SET_ID = portfolio.id;

// Installation is additive and one-time. Preserve existing deck edits,
// section assignments, ratings, active selection and deliberate deletions.
export function withPortfolioSet(state) {
  const installed = state.installedStudySets || [];
  if (installed.includes(PORTFOLIO_SET_ID)) return state;
  const exists = state.sets.some((set) => set.id === PORTFOLIO_SET_ID);
  return normalizeState({
    ...state,
    sets: exists ? state.sets : [...state.sets, structuredClone(portfolio)],
    activeSetId: state.activeSetId || PORTFOLIO_SET_ID,
    installedStudySets: [...installed, PORTFOLIO_SET_ID],
  });
}

export function withStudySets(state) {
  return withPortfolioSet(withMidtermSet(state));
}
