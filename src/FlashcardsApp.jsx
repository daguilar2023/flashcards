import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Icon, Modal, RichContent, RichEditor } from "./components";
import {
  COLORS,
  counts,
  emptyCard,
  hasContent,
  nextStudyCard,
  sectionGroups,
  normalizeState,
  plainText,
  sanitize,
  uid,
} from "./lib/model";
import { loadState, saveState } from "./lib/storage";
import { useCloudSync } from "./lib/useCloudSync";
import CloudAccount from "./CloudAccount";
import SectionsEditor from "./SectionsEditor";
import "./App.css";

const NAV = [
  ["/", "home", "Overview"],
  ["/sets", "edit", "Card editor"],
  ["/browse", "book", "Browse cards"],
  ["/learn", "spark", "Study"],
];
const PILES = [
  ["red", "Still learning"],
  ["yellow", "Almost there"],
  ["green", "Got it"],
];

export default function FlashcardsApp() {
  const [state, setState] = useState({ sets: [], activeSetId: null });
  const [loaded, setLoaded] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Loading your cards…");
  const [warning, setWarning] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [browseIndex, setBrowseIndex] = useState(0);
  const [browseBack, setBrowseBack] = useState(false);
  const [browseMode, setBrowseMode] = useState("cards");
  const [session, setSession] = useState(null);
  const [showBack, setShowBack] = useState(false);
  const [order, setOrder] = useState("ordered");
  const [pile, setPile] = useState("red");
  const [studyUndo, setStudyUndo] = useState(null);
  const importRef = useRef(null);
  const draftsRef = useRef(new Map());
  const saveVersion = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { sets, activeSetId } = state;
  const activeSet = sets.find((set) => set.id === activeSetId) || null;
  const totalCards = sets.reduce((total, set) => total + set.cards.length, 0);
  const totalMastered = sets.reduce(
    (total, set) => total + counts(set).green,
    0,
  );
  const activeCounts = counts(activeSet);
  const masteredPercent = activeSet?.cards.length
    ? Math.round((activeCounts.green / activeSet.cards.length) * 100)
    : 0;
  const query = search.trim().toLowerCase();
  const filteredSets = sets.filter(
    (set) =>
      !query ||
      set.name.toLowerCase().includes(query) ||
      set.cards.some((card) =>
        plainText(card.frontText + " " + card.backText)
          .toLowerCase()
          .includes(query),
      ),
  );
  const filteredCards = (activeSet?.cards || []).filter(
    (card) =>
      !query ||
      plainText(card.frontText + " " + card.backText)
        .toLowerCase()
        .includes(query),
  );
  const browseCard =
    activeSet?.cards[Math.min(browseIndex, activeSet.cards.length - 1)];
  const sessionCard = activeSet?.cards.find(
    (card) => card.id === session?.currentId,
  );
  const groups = sectionGroups(activeSet);
  const learningGroup = groups.find((group) => group.cards.some((card) => activeSet.progress?.[card.id] !== "green"));
  const sessionCardEligible = sessionCard && (pile === "green"
    ? activeSet.progress[sessionCard.id] === "green"
    : activeSet.progress[sessionCard.id] !== "green" && (order === "random" || learningGroup?.cards.some((card) => card.id === sessionCard.id)));
  const currentCard = !session?.currentId || sessionCardEligible ? sessionCard : activeSet?.cards.find((card) =>
    card.id === nextStudyCard(activeSet, activeSet.progress, null, order, pile).currentId);
  const currentGroup = groups.find((group) => group.cards.some((card) => card.id === currentCard?.id)) || learningGroup;
  const blankCard = useMemo(
    () => (activeSetId ? emptyCard() : null),
    [activeSetId],
  );
  const draftCard = draft?.card || blankCard;
  const cloud = useCloudSync({ state, setState, loaded, saveBlocked });
  const notify = useCallback(
    (message, action = null) => setToast({ message, action }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadState().then((result) => {
      if (cancelled) return;
      setState(result.state);
      setWarning(result.warning);
      setSaveBlocked(!!result.blocked);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded || saveBlocked) return;
    const version = ++saveVersion.current;
    setSaveStatus("Saving…");
    saveState(state)
      .then((message) => {
        if (version === saveVersion.current) {
          setSaveStatus(message);
          setWarning("");
        }
      })
      .catch((error) => {
        if (version === saveVersion.current) {
          setSaveStatus("Changes not saved");
          setWarning(error.message);
        }
      });
  }, [state, loaded, saveBlocked]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 9000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  function updateSet(id, update) {
    setState((previous) => ({
      ...previous,
      sets: previous.sets.map((set) => (set.id === id ? update(set) : set)),
    }));
  }
  function selectSet(id, route) {
    if (id !== activeSetId) {
      setState((previous) => ({ ...previous, activeSetId: id }));
      draftsRef.current.set(activeSetId, draft);
      setDraft(draftsRef.current.get(id) || null);
      setEditorError("");
      setBrowseIndex(0);
      setBrowseBack(false);
      setSession(null);
      setShowBack(false);
      setStudyUndo(null);
      setPile("red");
    }
    if (route) navigate(route);
  }
  function newCard() {
    setDraft({ card: emptyCard(), editing: false });
    setEditorError("");
    navigate("/sets");
  }
  function changeSections(sections) {
    updateSet(activeSet.id, (set) => ({ ...set, sections }));
    setSession(null); setStudyUndo(null);
  }
  function removeSection(section) {
    const setId = activeSet.id;
    const index = activeSet.sections.findIndex((item) => item.id === section.id);
    const assignedIds = activeSet.cards.filter((card) => card.sectionId === section.id).map((card) => card.id);
    updateSet(setId, (set) => ({ ...set,
      sections: set.sections.filter((item) => item.id !== section.id),
      cards: set.cards.map((card) => card.sectionId === section.id ? { ...card, sectionId: "" } : card),
    }));
    setSession(null); setStudyUndo(null);
    if (draft?.card.sectionId === section.id) changeDraft("sectionId", "");
    notify("Section removed. Its cards are now unsectioned.", () => updateSet(setId, (set) => {
      const sections = [...set.sections];
      sections.splice(Math.min(index, sections.length), 0, section);
      return { ...set, sections, cards: set.cards.map((card) => assignedIds.includes(card.id) && !card.sectionId
        ? { ...card, sectionId: section.id } : card) };
    }));
  }
  function editCard(card) {
    setDraft({ card: { ...card }, editing: true });
    setEditorError("");
    navigate("/sets");
  }
  function changeDraft(key, value) {
    setDraft((previous) => ({
      card: { ...(previous?.card || draftCard), [key]: value },
      editing: previous?.editing || false,
    }));
    setEditorError("");
  }
  function saveCard(event) {
    event.preventDefault();
    if (!activeSet) return;
    const card = {
      ...draftCard,
      sectionId: activeSet.sections?.some((section) => section.id === draftCard.sectionId) ? draftCard.sectionId : "",
      frontText: sanitize(draftCard.frontText),
      backText: sanitize(draftCard.backText),
    };
    if (!hasContent(card.frontText) && !card.frontImage)
      return setEditorError(
        "Add a question or an image to the front of your card.",
      );
    if (!hasContent(card.backText) && !card.backImage)
      return setEditorError(
        "Add an answer or an image to the back of your card.",
      );
    const editing = draft?.editing;
    updateSet(activeSet.id, (set) => ({
      ...set,
      cards: editing
        ? set.cards.map((old) => (old.id === card.id ? card : old))
        : [...set.cards, card],
      progress: { ...set.progress, [card.id]: "red" },
    }));
    setDraft({ card: emptyCard(), editing: false });
    setEditorError("");
    setSession(null);
    notify(
      editing
        ? "Card updated. It is ready to study again."
        : "Card added to your set.",
    );
  }
  function deleteCard(card) {
    const oldIndex = activeSet.cards.findIndex((item) => item.id === card.id);
    const oldStatus = activeSet.progress?.[card.id] || "red";
    const setId = activeSet.id;
    updateSet(setId, (set) => {
      const progress = { ...set.progress };
      delete progress[card.id];
      return {
        ...set,
        cards: set.cards.filter((item) => item.id !== card.id),
        progress,
      };
    });
    if (draft?.card.id === card.id) setDraft(null);
    setBrowseIndex(0);
    setBrowseBack(false);
    setSession(null);
    notify("Card deleted.", () =>
      updateSet(setId, (set) => {
        const cards = [...set.cards];
        cards.splice(Math.min(oldIndex, cards.length), 0, card);
        return {
          ...set,
          cards,
          progress: { ...set.progress, [card.id]: oldStatus },
        };
      }),
    );
  }
  function deleteSet(set) {
    const index = sets.findIndex((item) => item.id === set.id);
    setState((previous) => ({
      ...previous,
      sets: previous.sets.filter((item) => item.id !== set.id),
      activeSetId:
        previous.activeSetId === set.id
          ? previous.sets.find((item) => item.id !== set.id)?.id || null
          : previous.activeSetId,
    }));
    draftsRef.current.delete(set.id);
    setDraft(null);
    setSession(null);
    setBrowseIndex(0);
    setDialog(null);
    navigate("/");
    notify("Set deleted.", () =>
      setState((previous) => {
        const next = [...previous.sets];
        next.splice(Math.min(index, next.length), 0, set);
        return { ...previous, sets: next, activeSetId: set.id };
      }),
    );
  }
  function saveSet({ name, color }) {
    if (dialog.type === "rename")
      updateSet(dialog.set.id, (set) => ({ ...set, name, color }));
    else {
      draftsRef.current.set(activeSetId, draft);
      const set = { id: uid(), name, color, cards: [], sections: [], progress: {} };
      setState((previous) => ({
        ...previous,
        sets: [...previous.sets, set],
        activeSetId: set.id,
      }));
      setDraft({ card: emptyCard(), editing: false });
      setSession(null);
      setBrowseIndex(0);
      setPile("red");
      navigate("/sets");
    }
    setDialog(null);
    notify(
      dialog.type === "rename"
        ? "Set updated."
        : "Your new set is ready. Add your first card.",
    );
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 2, ...state }, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `flashcards-backup-${new Date().toLocaleDateString("en-CA")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Backup exported. Keep it somewhere safe.");
  }
  async function importData(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024)
      return notify("This backup is too large. Choose a file under 50 MB.");
    try {
      const incoming = normalizeState(JSON.parse(await file.text()));
      // Backups merge by ID; unrelated local sets are retained.
      const map = new Map(sets.map((set) => [set.id, set]));
      incoming.sets.forEach((set) => map.set(set.id, set));
      const merged = normalizeState({
        sets: [...map.values()],
        syncAccountId: state.syncAccountId,
        activeSetId: incoming.activeSetId || activeSetId,
        installedStudySets: [
          ...(state.installedStudySets || []),
          ...incoming.installedStudySets,
        ],
      });
      setState(merged);
      draftsRef.current.clear();
      setSaveBlocked(false);
      setDraft(null);
      setSession(null);
      setBrowseIndex(0);
      setBrowseBack(false);
      setPile("red");
      setSearch("");
      notify(
        `Imported ${incoming.sets.length} ${incoming.sets.length === 1 ? "set" : "sets"}. Your other sets are kept.`,
      );
    } catch (error) {
      notify(
        error instanceof SyntaxError
          ? "This file is not valid JSON. Choose a flashcards backup."
          : error.message,
      );
    }
  }
  function startSession(reset = false) {
    if (!activeSet?.cards.length) return;
    const progress = reset
      ? Object.fromEntries(activeSet.cards.map((card) => [card.id, "red"]))
      : activeSet.progress || {};
    if (reset) updateSet(activeSet.id, (set) => ({ ...set, progress, studyResetId: uid() }));
    const next = nextStudyCard(activeSet, progress, null, order, reset ? "red" : pile);
    setPile(next.pile);
    setSession({
      currentId: next.currentId,
      reviewed: 0,
    });
    setShowBack(false);
    setStudyUndo(null);
  }
  const rateCard = useCallback(
    (choice) => {
      if (!activeSet || !currentCard || !showBack) return;
      if (choice === "red" && activeSet.progress[currentCard.id] === "yellow") return;
      const progress = { ...activeSet.progress, [currentCard.id]: choice };
      setStudyUndo({ cardId: currentCard.id, previousColor: activeSet.progress[currentCard.id] || "red", session, pile });
      setState((previous) => ({
        ...previous,
        sets: previous.sets.map((set) =>
          set.id === activeSet.id ? { ...set, progress } : set,
        ),
      }));
      const next = nextStudyCard(activeSet, progress, currentCard.id, order, pile);
      setPile(next.pile);
      setSession({
        currentId: next.currentId,
        reviewed: session.reviewed + 1,
      });
      setShowBack(false);
    },
    [activeSet, currentCard, showBack, session, order, pile],
  );
  function selectPile(value) {
    const next = nextStudyCard(activeSet, activeSet.progress || {}, null, order, value);
    setPile(next.pile);
    setShowBack(false);
    setStudyUndo(null);
    if (session)
      setSession((previous) => ({
        ...previous,
        currentId: next.currentId,
      }));
  }
  function undoRating() {
    if (!studyUndo) return;
    updateSet(activeSet.id, (set) => ({
      ...set,
      progress: { ...set.progress, [studyUndo.cardId]: studyUndo.previousColor },
    }));
    setSession(studyUndo.session);
    setPile(studyUndo.pile);
    setShowBack(true);
    setStudyUndo(null);
  }
  function changeOrder(value) {
    setOrder(value);
    setStudyUndo(null);
    if (session) {
      if (value === "random" && currentCard && activeSet.progress[currentCard.id] !== "green") {
        setPile(activeSet.progress[currentCard.id] || "red");
        return;
      }
      setShowBack(false);
      const next = nextStudyCard(activeSet, activeSet.progress, null, value, pile === "green" ? "green" : "red");
      setPile(next.pile);
      setSession((previous) => ({ ...previous, currentId: next.currentId }));
    }
  }
  useEffect(() => {
    if (location.pathname !== "/learn" || !session || !currentCard) return;
    const onKey = (event) => {
      if (
        event.target.closest(
          "input, textarea, select, [contenteditable], dialog",
        ) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.code === "Space" && !event.target.closest("button, a")) {
        event.preventDefault();
        setShowBack((previous) => !previous);
      }
      if (showBack && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        rateCard(["red", "yellow", "green"][Number(event.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [location.pathname, session, currentCard, showBack, rateCard]);

  const editorKey = draftCard?.id;
  if (!loaded)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <Icon name="stack" size={26} />
        </div>
        <p>Opening your learning space…</p>
      </div>
    );
  const title =
    NAV.find(([path]) => path === location.pathname)?.[2] || "Overview";
  const setHeader = (
    <div className="set-heading">
      <div>
        <span className="eyebrow">YOUR FLASHCARD SET</span>
        <h1>{activeSet?.name}</h1>
        <p>
          {activeSet?.cards.length || 0} cards{" "}
          <span className="text-dot">·</span> {activeCounts.green} mastered{" "}
          <span className="text-dot">·</span> A little better every day
        </p>
      </div>
      <button
        className="button"
        onClick={() => setDialog({ type: "rename", set: activeSet })}
      >
        <Icon name="edit" size={16} /> Edit set
      </button>
    </div>
  );
  const setTabs = (
    <div className="set-tabs">
      {NAV.slice(1).map(([path, icon, label]) => (
        <NavLink key={path} to={path}>
          <Icon name={icon} size={17} />
          {label}
        </NavLink>
      ))}
    </div>
  );
  const noSet = (
    <EmptyState
      icon="stack"
      title="Your next idea starts here"
      text="Create a set, add a few cards, and make something new stick."
      action="Create a set"
      onAction={() => setDialog({ type: "create" })}
    />
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <Icon name="stack" size={23} />
          </span>
          <span>
            flashcards<span className="brand-dot">.</span>
          </span>
        </NavLink>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map(([path, icon, label]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon name={icon} />
              <span>{label}</span>
              {path === "/learn" && <span className="nav-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-section-label sets-label">
          <span>
            MY SETS <span className="set-count">{sets.length}</span>
          </span>
          <button
            className="icon-button"
            aria-label="Create a set"
            onClick={() => setDialog({ type: "create" })}
          >
            <Icon name="plus" size={17} />
          </button>
        </div>
        <div className="sidebar-sets">
          {sets.map((set) => (
            <button
              className={`sidebar-set ${activeSetId === set.id ? "selected" : ""}`}
              key={set.id}
              onClick={() => selectSet(set.id)}
            >
              <span className={`set-dot ${set.color}`} />
              <span>{set.name}</span>
              <small>{set.cards.length}</small>
            </button>
          ))}
          {!sets.length && (
            <p className="sidebar-empty">
              A fresh start. Create your first set.
            </p>
          )}
        </div>
        <button
          className="sidebar-new"
          onClick={() => setDialog({ type: "create" })}
        >
          <Icon name="plus" size={17} /> New set
        </button>
        <div className="sidebar-bottom">
          <div className="small-illustration" aria-hidden="true">
            <div />
            <div />
            <div>
              <Icon name="spark" size={23} />
            </div>
          </div>
          <h3>Make it stick.</h3>
          <p>
            A few minutes today.
            <br />A little more remembered tomorrow.
          </p>
          <NavLink to="/learn">
            Find your focus <Icon name="arrow" size={15} />
          </NavLink>
        </div>
        <div className="local-status">
          <span className={`status-dot ${warning ? "status-warning" : ""}`} />
          <span>{saveBlocked ? "Storage needs attention" : saveStatus}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            My workspace
            <Icon name="chevron" size={13} />
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              title="Export all sets"
              aria-label="Export backup"
              onClick={exportData}
            >
              <Icon name="download" size={18} />
            </button>
            <button
              className="button subtle"
              onClick={() => importRef.current.click()}
            >
              <Icon name="upload" size={16} /> Import
            </button>
            <input
              type="file"
              ref={importRef}
              hidden
              accept=".json,application/json"
              onChange={importData}
            />
            <CloudAccount cloud={cloud} />
          </div>
        </header>
        <main className="main-content">
          {warning && (
            <div className="warning-banner" role="alert">
              {warning}
              <button onClick={exportData}>Export backup</button>
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <div className="overview-heading">
                    <div>
                      <span className="eyebrow">YOUR LEARNING SPACE</span>
                      <h1>
                        Good things take practice
                        <span className="brand-dot">.</span>
                      </h1>
                      <p>
                        Pick up where you left off. Make a little progress
                        today.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setDialog({ type: "create" })}
                    >
                      <Icon name="plus" size={17} /> Create a set
                    </button>
                  </div>
                  <div className="hero-panel">
                    <div className="hero-copy">
                      <span className="eyebrow">A LITTLE EVERY DAY</span>
                      <h2>
                        Small cards.
                        <br />
                        Big possibilities.
                      </h2>
                      <p>
                        Turn what you want to know into
                        <br className="desktop-break" /> what you remember.
                      </p>
                      <button
                        className="button dark"
                        disabled={!activeSet?.cards.length}
                        onClick={() => {
                          navigate("/learn");
                          startSession();
                        }}
                      >
                        Let's study <Icon name="arrow" size={18} />
                      </button>
                      {activeSet?.cards.length > 0 && (
                        <span className="hero-meta">
                          {activeSet.name} · {activeSet.cards.length} cards
                        </span>
                      )}
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <span className="art-spark spark-one">✦</span>
                      <span className="art-spark spark-two">✧</span>
                      <div className="art-card art-card-back" />
                      <div className="art-card art-card-middle" />
                      <div className="art-card art-card-front">
                        <span className="art-mini-label">
                          ONE CARD AT A TIME
                        </span>
                        <Icon name="spark" size={48} />
                        <span className="art-card-text">
                          A little more
                          <br />
                          than yesterday.
                        </span>
                        <span className="art-card-footer">
                          keep growing <span>↗</span>
                        </span>
                      </div>
                      <span className="art-orbit" />
                    </div>
                  </div>
                  <div className="stats-grid">
                    <Stat
                      icon="stack"
                      value={sets.length}
                      label="sets in your library"
                      color="clay"
                    />
                    <Stat
                      icon="book"
                      value={totalCards}
                      label="cards to get curious about"
                      color="blue"
                    />
                    <Stat
                      icon="check"
                      value={totalMastered}
                      label="cards you've mastered"
                      color="sage"
                    />
                  </div>
                  <div className="collection-heading">
                    <div>
                      <h2>
                        Your sets{" "}
                        <span className="count-pill">{sets.length}</span>
                      </h2>
                      <p>A home for everything you're learning.</p>
                    </div>
                    <label className="search-field">
                      <Icon name="search" size={18} />
                      <input
                        type="search"
                        aria-label="Search sets and cards"
                        placeholder="Search your sets…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="deck-grid">
                    {filteredSets.map((set) => {
                      const summary = counts(set);
                      const percentage = set.cards.length
                        ? Math.round((summary.green / set.cards.length) * 100)
                        : 0;
                      return (
                        <article
                          key={set.id}
                          className={`deck-card ${set.color}`}
                        >
                          <div className="deck-top">
                            <span className={`deck-icon ${set.color}`}>
                              <Icon name="stack" size={23} />
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${set.name}`}
                              onClick={() => setDialog({ type: "rename", set })}
                            >
                              <Icon name="edit" size={16} />
                            </button>
                          </div>
                          <button
                            className="deck-title"
                            onClick={() => selectSet(set.id, "/browse")}
                          >
                            {set.name}
                          </button>
                          <p>
                            {set.cards.length}{" "}
                            {set.cards.length === 1 ? "card" : "cards"}{" "}
                            <span className="text-dot">·</span> {summary.green}{" "}
                            mastered
                          </p>
                          <div className="deck-progress-label">
                            <span>Your progress</span>
                            <span>{percentage}%</span>
                          </div>
                          <div className="progress-track">
                            <div style={{ width: `${percentage}%` }} />
                          </div>
                          <div className="deck-footer">
                            <button
                              onClick={() => {
                                selectSet(set.id, "/learn");
                              }}
                              disabled={!set.cards.length}
                            >
                              Study set <Icon name="arrow" size={16} />
                            </button>
                            <button
                              className="text-button muted"
                              onClick={() => selectSet(set.id, "/sets")}
                            >
                              Add cards
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    <button
                      className="new-deck"
                      onClick={() => setDialog({ type: "create" })}
                    >
                      <span className="new-deck-icon">
                        <Icon name="plus" size={25} />
                      </span>
                      <strong>Something new to learn?</strong>
                      <span>Create a fresh set</span>
                    </button>
                  </div>
                  {query && !filteredSets.length && (
                    <p className="empty-search">
                      No sets match “{search}”. Try another search.
                    </p>
                  )}
                  <div className="dashboard-note">
                    <Icon name="spark" size={16} />
                    <span>
                      You don't have to learn it all today. Just start with one
                      card.
                    </span>
                  </div>
                </>
              }
            />
            <Route
              path="/sets"
              element={
                activeSet ? (
                  <>
                    {setHeader}
                    {setTabs}
                    <SectionsEditor key={activeSet.id} set={activeSet} onChange={changeSections} onRemove={removeSection} />
                    <div className="editor-layout">
                      <section className="card-list-panel">
                        <div className="panel-heading">
                          <h2>
                            Your cards{" "}
                            <span className="count-pill">
                              {activeSet.cards.length}
                            </span>
                          </h2>
                          <button
                            className="icon-button"
                            onClick={newCard}
                            aria-label="Add a new card"
                          >
                            <Icon name="plus" size={18} />
                          </button>
                        </div>
                        <label className="search-field compact">
                          <Icon name="search" size={16} />
                          <input
                            type="search"
                            placeholder="Find a card…"
                            aria-label="Search cards"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                          />
                        </label>
                        <div className="card-list">
                          {filteredCards.map((card) => (
                            <div
                              key={card.id}
                              className={`card-list-item ${draft?.card.id === card.id ? "selected" : ""}`}
                            >
                              <button
                                className="card-list-select"
                                onClick={() => editCard(card)}
                              >
                                <span className="card-number">
                                  {activeSet.cards.indexOf(card) + 1}
                                </span>
                                <span>
                                  <strong>
                                    {plainText(card.frontText) || "Image card"}
                                  </strong>
                                  <small className="card-section-label">{activeSet.sections?.find((section) => section.id === card.sectionId)?.name || "No section"}</small>
                                  <small>
                                    {plainText(card.backText) || "Image answer"}
                                  </small>
                                </span>
                              </button>
                              <button
                                className="icon-button delete-card"
                                aria-label={`Delete card ${activeSet.cards.indexOf(card) + 1}`}
                                onClick={() => deleteCard(card)}
                              >
                                <Icon name="trash" size={15} />
                              </button>
                            </div>
                          ))}
                          {!filteredCards.length && (
                            <p className="list-empty">
                              {query
                                ? "No matching cards."
                                : "Your first card goes here."}
                            </p>
                          )}
                        </div>
                      </section>
                      <form className="editor-panel" onSubmit={saveCard}>
                        <div className="panel-heading">
                          <div>
                            <span className="eyebrow">MAKE IT MEMORABLE</span>
                            <h2>
                              {draft?.editing
                                ? "Edit your card"
                                : "Create a new card"}
                            </h2>
                          </div>
                          <span className="editor-tip">
                            One idea. Two sides.
                          </span>
                        </div>
                        <label className="field-label card-section-field">Section (optional)
                          <select aria-label="Card section" value={draftCard.sectionId || ""}
                            onChange={(event) => changeDraft("sectionId", event.target.value)}>
                            <option value="">No section</option>
                            {(activeSet.sections || []).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                          </select>
                        </label>
                        <RichEditor
                          key={`${editorKey}-front`}
                          side="Front"
                          html={draftCard.frontText}
                          image={draftCard.frontImage}
                          onChange={(value) => changeDraft("frontText", value)}
                          onImage={(value) => changeDraft("frontImage", value)}
                          onError={setEditorError}
                        />
                        <RichEditor
                          key={`${editorKey}-back`}
                          side="Back"
                          html={draftCard.backText}
                          image={draftCard.backImage}
                          onChange={(value) => changeDraft("backText", value)}
                          onImage={(value) => changeDraft("backImage", value)}
                          onError={setEditorError}
                        />
                        {editorError && (
                          <p className="form-error" role="alert">
                            {editorError}
                          </p>
                        )}
                        <div className="editor-actions">
                          <span className="muted">
                            Text, images, or a little of both.
                          </span>
                          <div>
                            {draft?.editing && (
                              <button
                                type="button"
                                className="button"
                                onClick={() => {
                                  setDraft({
                                    card: emptyCard(),
                                    editing: false,
                                  });
                                  setEditorError("");
                                }}
                              >
                                Cancel
                              </button>
                            )}
                            <button className="button primary">
                              <Icon
                                name={draft?.editing ? "check" : "plus"}
                                size={17}
                              />
                              {draft?.editing ? "Save changes" : "Add card"}
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </>
                ) : (
                  noSet
                )
              }
            />
            <Route
              path="/browse"
              element={
                activeSet ? (
                  <>
                    {setHeader}
                    {setTabs}
                    {!!activeSet.cards.length && (
                      <div className="browse-view-tabs" aria-label="Browse view">
                        <button
                          className={`button ${browseMode === "cards" ? "primary" : ""}`}
                          aria-pressed={browseMode === "cards"}
                          onClick={() => setBrowseMode("cards")}
                        >
                          Flashcards
                        </button>
                        <button
                          className={`button ${browseMode === "all" ? "primary" : ""}`}
                          aria-pressed={browseMode === "all"}
                          onClick={() => setBrowseMode("all")}
                        >
                          All questions &amp; answers
                        </button>
                      </div>
                    )}
                    {browseCard ? (
                      browseMode === "all" ? (
                        <section className="all-cards-area" aria-label="All questions and answers">
                          <label className="search-field">
                            <Icon name="search" size={16} />
                            <input
                              type="search"
                              placeholder="Find a topic or answer…"
                              aria-label="Search questions and answers"
                              value={search}
                              onChange={(event) => setSearch(event.target.value)}
                            />
                          </label>
                          <p className="all-cards-count">{filteredCards.length} of {activeSet.cards.length} cards · In review order</p>
                          {filteredCards.map((card) => (
                            <article className="answer-sheet-card" key={card.id}>
                              <div className="answer-sheet-heading">
                                <span>Card {activeSet.cards.indexOf(card) + 1}</span>
                                <button className="button" onClick={() => editCard(card)}>
                                  <Icon name="edit" size={15} /> Edit card
                                </button>
                              </div>
                              <div className="answer-sheet-sides">
                                <div className="answer-sheet-front">
                                  <span className="eyebrow">QUESTION</span>
                                  <RichContent html={card.frontText} image={card.frontImage} side="Question" />
                                </div>
                                <div className="answer-sheet-back">
                                  <span className="eyebrow">ANSWER</span>
                                  <RichContent html={card.backText} image={card.backImage} side="Answer" />
                                </div>
                              </div>
                            </article>
                          ))}
                          {!filteredCards.length && <p className="list-empty">No matching cards.</p>}
                        </section>
                      ) : (
                      <div className="browse-area">
                        <div className="study-topline">
                          <span className="eyebrow">A MOMENT TO REVIEW</span>
                          <span>
                            Card{" "}
                            {Math.min(browseIndex + 1, activeSet.cards.length)}{" "}
                            of {activeSet.cards.length}
                          </span>
                        </div>
                        <div className="flashcard browse-flashcard">
                          <div className="flashcard-label">
                            <span>
                              {browseBack ? "THE ANSWER" : "THE QUESTION"}
                            </span>
                            <span
                              className={`confidence-dot ${activeSet.progress?.[browseCard.id] || "red"}`}
                            />
                          </div>
                          <RichContent
                            html={
                              browseBack
                                ? browseCard.backText
                                : browseCard.frontText
                            }
                            image={
                              browseBack
                                ? browseCard.backImage
                                : browseCard.frontImage
                            }
                            side={browseBack ? "Answer" : "Question"}
                          />
                          <button
                            className="flip-button"
                            onClick={() =>
                              setBrowseBack((previous) => !previous)
                            }
                          >
                            <Icon name="flip" size={16} />
                            {browseBack ? "See question" : "Reveal answer"}
                          </button>
                        </div>
                        <div className="browse-controls">
                          <button
                            className="button"
                            aria-label="Previous card"
                            onClick={() => {
                              setBrowseIndex(
                                (index) =>
                                  (Math.min(index, activeSet.cards.length - 1) -
                                    1 +
                                    activeSet.cards.length) %
                                  activeSet.cards.length,
                              );
                              setBrowseBack(false);
                            }}
                          >
                            <Icon
                              name="arrow"
                              className="rotate-arrow"
                              size={17}
                            />{" "}
                            Previous
                          </button>
                          <button
                            className="text-button"
                            onClick={() => editCard(browseCard)}
                          >
                            <Icon name="edit" size={15} /> Edit this card
                          </button>
                          <button
                            className="button"
                            aria-label="Next card"
                            onClick={() => {
                              setBrowseIndex(
                                (index) => (index + 1) % activeSet.cards.length,
                              );
                              setBrowseBack(false);
                            }}
                          >
                            Next <Icon name="arrow" size={17} />
                          </button>
                        </div>
                        <p className="below-card-note">
                          Take your time. Browsing doesn't change your study
                          progress.
                        </p>
                      </div>
                      )
                    ) : (
                      <EmptyState
                        icon="book"
                        title="Let's fill this set"
                        text="Add a few questions and answers, then come back to explore them."
                        action="Add your first card"
                        onAction={newCard}
                      />
                    )}
                  </>
                ) : (
                  noSet
                )
              }
            />
            <Route
              path="/learn"
              element={
                activeSet ? (
                  <>
                    {setHeader}
                    {setTabs}
                    {activeSet.cards.length ? (
                      <div className="learn-area">
                        <div className="study-settings">
                          <div className="pile-tabs" aria-label="Study pile">
                            {PILES.map(([color, label]) => (
                              <button
                                key={color}
                                className={pile === color ? "selected" : ""}
                                onClick={() => selectPile(color)}
                              >
                                <span className={`confidence-dot ${color}`} />
                                {label} <span>{activeCounts[color]}</span>
                              </button>
                            ))}
                          </div>
                          <label className="order-select">
                            <Icon name="shuffle" size={16} />
                            <select
                              aria-label="Study order"
                              value={order}
                              onChange={(event) => changeOrder(event.target.value)}
                            >
                              <option value="ordered">In order</option>
                              <option value="random">Random</option>
                            </select>
                          </label>
                          <button className="button restart-study" onClick={() => {
                            startSession(true);
                            notify("Study restarted. Every card is red again.");
                          }}>Restart study</button>
                        </div>
                        {!!activeSet.sections?.length && <div className="study-section-context">
                          <strong>{order === "random" ? "All sections · Random order" : currentGroup
                            ? `${currentGroup.name} · Section ${groups.indexOf(currentGroup) + 1} of ${groups.length}`
                            : "All sections completed"}</strong>
                          <p>{pile === "green" ? "Review mastered cards. Choose red or yellow to continue learning."
                            : order === "random" ? "Mix all unfinished cards across sections."
                            : "Make every card in this section green to unlock the next."}</p>
                          <details className="section-progress-list">
                            <summary>Section progress</summary>
                            <ol>{groups.map((group, index) => {
                              const mastered = group.cards.filter((card) => activeSet.progress[card.id] === "green").length;
                              const locked = order === "ordered" && learningGroup && index > groups.indexOf(learningGroup);
                              return <li key={group.id} className={group.id === currentGroup?.id ? "current-section" : ""}>
                                <span>{group.name}</span><small>{mastered}/{group.cards.length} green{locked ? " · Locked" : mastered === group.cards.length ? " · Complete" : ""}</small>
                              </li>;
                            })}</ol>
                          </details>
                        </div>}
                        <div className="study-progress">
                          <div className="progress-track">
                            <div style={{ width: `${masteredPercent}%` }} />
                          </div>
                          <span>{masteredPercent}% mastered</span>
                        </div>
                        {!session ? (
                          <div className="study-intro">
                            <span className="intro-icon">
                              <Icon name="spark" size={32} />
                            </span>
                            <span className="eyebrow">
                              A LITTLE FOCUS GOES A LONG WAY
                            </span>
                            <h2>
                              {masteredPercent === 100
                                ? "Look at everything you know."
                                : "Ready to make it stick?"}
                            </h2>
                            <p>
                              Think of your answer, flip the card, then choose
                              how well
                              <br className="desktop-break" /> you remembered.
                              Your progress is saved as you go.
                            </p>
                            <button
                              className="button primary"
                              onClick={() => masteredPercent === 100 && pile !== "green"
                                ? startSession(true) : startSession()}
                            >
                              {masteredPercent === 100 && pile !== "green"
                                ? "Practice again"
                                : "Start studying"}
                              <Icon name="arrow" size={17} />
                            </button>
                            <span className="study-hint">
                              <Icon name="clock" size={14} /> At your own pace.
                              No pressure.
                            </span>
                          </div>
                        ) : currentCard ? (
                          <>
                            <div className="study-topline">
                              <span className="eyebrow">
                                {showBack
                                  ? "HOW DID YOU DO?"
                                  : "THINK BEFORE YOU FLIP"}
                              </span>
                              <span>
                                {session.reviewed} reviewed this session{" "}
                                <span className="text-dot">·</span>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setSession(null);
                                    setShowBack(false);
                                  }}
                                >
                                  End session
                                </button>
                              </span>
                            </div>
                            <div
                              className={`flashcard study-flashcard ${showBack ? "answer-visible" : ""}`}
                              onClick={(event) => {
                                if (event.target.closest("button, a, pre, code")) return;
                                if (window.getSelection()?.toString()) return;
                                setShowBack((previous) => !previous);
                              }}
                            >
                              <div className="flashcard-label">
                                <span>
                                  {showBack ? "THE ANSWER" : "THE QUESTION"}
                                </span>
                                <Icon name="stack" size={18} />
                              </div>
                              <RichContent
                                html={
                                  showBack
                                    ? currentCard.backText
                                    : currentCard.frontText
                                }
                                image={
                                  showBack
                                    ? currentCard.backImage
                                    : currentCard.frontImage
                                }
                                side={showBack ? "Answer" : "Question"}
                              />
                              <button
                                className="flip-button"
                                onClick={() =>
                                  setShowBack((previous) => !previous)
                                }
                              >
                                <Icon name="flip" size={16} />
                                {showBack ? "See question" : "Reveal answer"}
                                <kbd>space</kbd>
                              </button>
                            </div>
                            <div className="rating-buttons">
                              {PILES.map(([color, label], index) => (
                                <button
                                  key={color}
                                  className={`rating-button ${color}`}
                                  disabled={!showBack || (color === "red" && activeSet.progress[currentCard.id] === "yellow")}
                                  onClick={() => rateCard(color)}
                                >
                                  <span className="confidence-dot" />
                                  {label}
                                  <kbd>{index + 1}</kbd>
                                </button>
                              ))}
                            </div>
                            <div className="study-footnote">
                              <span>
                                {showBack
                                  ? "Choose the answer that feels right. Honesty helps you learn."
                                  : "Reveal the answer to rate your recall."}
                                {showBack && activeSet.progress[currentCard.id] === "yellow" && " Yellow cards stay yellow or move to green."}
                              </span>
                              {studyUndo && (
                                <button
                                  className="text-button"
                                  onClick={undoRating}
                                >
                                  Undo last rating
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="study-intro">
                            <span className="intro-icon">
                              <Icon name="check" size={34} />
                            </span>
                            <span className="eyebrow">
                              {masteredPercent === 100
                                ? "THAT’S PROGRESS"
                                : "ALL CLEAR"}
                            </span>
                            <h2>
                              {masteredPercent === 100
                                ? "You made it stick."
                                : "This pile is all caught up."}
                            </h2>
                            <p>
                              {masteredPercent === 100
                                ? `You've mastered all ${activeSet.cards.length} cards in this set. Nice work.`
                                : "Choose another pile to keep going, or take a well-earned break."}
                            </p>
                            <div className="completion-actions">
                              <button
                                className="button primary"
                                onClick={() =>
                                  masteredPercent === 100
                                    ? startSession(true)
                                    : selectPile("red")
                                }
                              >
                                {masteredPercent === 100
                                  ? "Practice again"
                                  : "Continue practicing"}
                                <Icon name="arrow" size={17} />
                              </button>
                              {studyUndo && (
                                <button className="button" onClick={undoRating}>
                                  Undo last rating
                                </button>
                              )}
                            </div>
                            <NavLink className="text-button" to="/">
                              Back to your sets
                            </NavLink>
                          </div>
                        )}
                      </div>
                    ) : (
                      <EmptyState
                        icon="spark"
                        title="A little preparation first"
                        text="Add cards to this set and your next study session is ready to go."
                        action="Add your first card"
                        onAction={newCard}
                      />
                    )}
                  </>
                ) : (
                  noSet
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="workspace-footer">
          <span>{cloud.user ? cloud.status : "Made for curious minds."}</span>
          <span>
            <Icon name="check" size={13} />
            <span className="footer-desktop-status">
              Your cards stay on this device.
            </span>
            <span className="footer-mobile-status">
              {saveBlocked ? "Storage needs attention" : saveStatus}
            </span>
          </span>
        </footer>
      </div>
      {dialog &&
        (dialog.type === "delete" ? (
          <Modal title="Delete this set?" onClose={() => setDialog(null)}>
            <p className="dialog-description">
              “{dialog.set.name}” and its {dialog.set.cards.length} cards will
              be removed. You can undo this just after deleting.
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setDialog(null)}>
                Keep set
              </button>
              <button
                className="button danger"
                onClick={() => deleteSet(dialog.set)}
              >
                Delete set
              </button>
            </div>
          </Modal>
        ) : (
          <SetDialog
            set={dialog.set}
            onClose={() => setDialog(null)}
            onSave={saveSet}
            onDelete={() => setDialog({ type: "delete", set: dialog.set })}
          />
        ))}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          <span>{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, value, label, color }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${color}`}>
        <Icon name={icon} size={22} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
function EmptyState({ icon, title, text, action, onAction }) {
  return (
    <div className="empty-state">
      <span className="intro-icon">
        <Icon name={icon} size={32} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="button primary" onClick={onAction}>
        <Icon name="plus" size={17} />
        {action}
      </button>
    </div>
  );
}
function SetDialog({ set, onClose, onSave, onDelete }) {
  const [name, setName] = useState(set?.name || "");
  const [color, setColor] = useState(set?.color || "clay");
  return (
    <Modal
      title={set ? "Make this set yours" : "Something new to learn"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSave({ name: name.trim(), color });
        }}
      >
        <p className="dialog-description">
          {set
            ? "Give your set a name and a color that feel right."
            : "Give your next collection of ideas a home."}
        </p>
        <label className="field-label">
          Set name
          <input
            autoFocus
            required
            maxLength={100}
            placeholder="e.g. Spanish, biology, big ideas…"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <fieldset className="color-picker">
          <legend>Pick a color</legend>
          {COLORS.map((option) => (
            <button
              type="button"
              key={option}
              className={`color-option ${option} ${color === option ? "selected" : ""}`}
              aria-label={`${option} color`}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
            >
              {color === option && <Icon name="check" size={18} />}
            </button>
          ))}
        </fieldset>
        <div className="modal-actions">
          {set && (
            <button
              type="button"
              className="text-button delete-set-button"
              onClick={onDelete}
            >
              <Icon name="trash" size={16} />
              Delete set
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!name.trim()}>
            {set ? "Save changes" : "Create set"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
