const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Send edits relative to the last cloud snapshot, rather than overwrite a
// second device's unrelated cards or ratings with an older full snapshot.
export function statePatch(before, after) {
  const previous = new Map(before.sets.map((set) => [set.id, set]));
  const current = new Set(after.sets.map((set) => set.id));
  const changes = [];
  for (const set of after.sets) {
    const old = previous.get(set.id);
    const oldCards = new Map((old?.cards || []).map((card) => [card.id, card]));
    const ids = new Set(set.cards.map((card) => card.id));
    const patch = {
      id: set.id,
      created: !old,
      meta: {},
      cards: set.cards.filter((card) => !equal(card, oldCards.get(card.id))),
      removed: [...oldCards.keys()].filter((id) => !ids.has(id)),
      progress: Object.fromEntries(set.cards
        .filter((card) => !old || (set.progress?.[card.id] || "red") !== (old.progress?.[card.id] || "red"))
        .map((card) => [card.id, set.progress?.[card.id] || "red"])),
    };
    for (const field of ["name", "color", "sectionSchemaVersion", "studyResetId"]) {
      if (!old || set[field] !== old[field]) patch.meta[field] = set[field];
    }
    const oldSections = new Map((old?.sections || []).map((section) => [section.id, section]));
    patch.sections = (set.sections || []).filter((section) => !equal(section, oldSections.get(section.id)));
    patch.removedSections = [...oldSections.keys()].filter((id) => !(set.sections || []).some((section) => section.id === id));
    if (!equal((old?.sections || []).map((section) => section.id), (set.sections || []).map((section) => section.id))) {
      patch.sectionOrder = (set.sections || []).map((section) => section.id);
    }
    if (!equal(set.cards.map((c) => c.id), (old?.cards || []).map((c) => c.id))) {
      patch.order = set.cards.map((c) => c.id);
    }
    if (patch.created || Object.keys(patch.meta).length || patch.cards.length ||
        patch.removed.length || Object.keys(patch.progress).length || patch.order ||
        patch.sections.length || patch.removedSections.length || patch.sectionOrder) {
      changes.push(patch);
    }
  }
  return {
    changes,
    removed: [...previous.keys()].filter((id) => !current.has(id)),
    installed: (after.installedStudySets || [])
      .filter((id) => !(before.installedStudySets || []).includes(id)),
  };
}

export const hasPatch = (patch) => !!(patch.changes.length || patch.removed.length || patch.installed.length);

export function applyPatch(remote, patch) {
  const sets = new Map(remote.sets.filter((set) => !patch.removed.includes(set.id))
    .map((set) => [set.id, structuredClone(set)]));
  for (const change of patch.changes) {
    // A stale rating alone must not resurrect a set deleted on another device.
    if (!sets.has(change.id) && !change.created) continue;
    const set = sets.get(change.id) || { id: change.id, cards: [], progress: {} };
    const reset = change.meta.studyResetId && change.meta.studyResetId !== set.studyResetId;
    Object.assign(set, change.meta);
    const sections = new Map((set.sections || []).filter((section) => !change.removedSections.includes(section.id))
      .map((section) => [section.id, section]));
    change.sections.forEach((section) => sections.set(section.id, structuredClone(section)));
    set.sections = [...new Set([...(change.sectionOrder || [...sections.keys()]), ...sections.keys()])]
      .filter((id) => sections.has(id)).map((id) => sections.get(id));
    const cards = new Map(set.cards.filter((card) => !change.removed.includes(card.id))
      .map((card) => [card.id, card]));
    change.cards.forEach((card) => cards.set(card.id, structuredClone(card)));
    const order = change.order || [...cards.keys()];
    set.cards = [...new Set([...order, ...cards.keys()])]
      .filter((id) => cards.has(id)).map((id) => cards.get(id));
    set.progress = Object.fromEntries(set.cards.map((card) => [card.id,
      change.progress[card.id] || (reset ? "red" : set.progress?.[card.id]) || "red",
    ]));
    sets.set(set.id, set);
  }
  return {
    ...remote,
    sets: [...sets.values()],
    installedStudySets: [...new Set([...(remote.installedStudySets || []), ...patch.installed])],
  };
}
