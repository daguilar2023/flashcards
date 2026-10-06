import midterm from "../data/android-midterm.json";
import { normalizeState } from "./model";

export const MIDTERM_SET_ID = midterm.id;

// Install once. Existing edits, progress, other sets, and deliberate deletions survive.
export function withMidtermSet(state) {
  const installed = state.installedStudySets || [];
  if (installed.includes(MIDTERM_SET_ID)) return state;
  const exists = state.sets.some((set) => set.id === MIDTERM_SET_ID);
  return normalizeState({
    ...state,
    sets: exists ? state.sets : [...state.sets, structuredClone(midterm)],
    activeSetId: state.activeSetId || MIDTERM_SET_ID,
    installedStudySets: [...installed, MIDTERM_SET_ID],
  });
}
