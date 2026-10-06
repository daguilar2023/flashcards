import { useState } from "react";
import { uid } from "./lib/model";

export default function SectionsEditor({ set, onChange, onRemove }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const sections = set.sections || [];
  function save(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (sections.some((section) => section.id !== editing && section.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("A section already has that name."); return;
    }
    onChange(editing ? sections.map((section) => section.id === editing ? { ...section, name: trimmed } : section)
      : [...sections, { id: uid(), name: trimmed }]);
    setName(""); setEditing(null); setError("");
  }
  function move(index, direction) {
    const next = [...sections];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  }
  return <details className="sections-editor">
    <summary>Sections <span className="count-pill">{sections.length}</span> <span className="optional-label">optional</span></summary>
    <p>In ordered study, finish each section before the next. Cards without a section come last.</p>
    <ol className="section-edit-list">
      {sections.map((section, index) => <li key={section.id}>
        <span>{section.name}</span>
        <small>{set.cards.filter((card) => card.sectionId === section.id).length} cards</small>
        <div className="section-row-actions">
          <button type="button" aria-label={`Move ${section.name} earlier`} disabled={!index} onClick={() => move(index, -1)}>↑</button>
          <button type="button" aria-label={`Move ${section.name} later`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}>↓</button>
          <button type="button" onClick={() => { setEditing(section.id); setName(section.name); setError(""); }}>Rename</button>
          <button type="button" onClick={() => {
            onRemove(section);
            if (editing === section.id) { setEditing(null); setName(""); }
          }}>Remove</button>
        </div>
      </li>)}
    </ol>
    <form className="section-add-form" onSubmit={save}>
      <label className="field-label">{editing ? "Section name" : "New section name"}
        <input required maxLength={100} value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="e.g. The Android system" />
      </label>
      <button className="button" disabled={!name.trim()}>{editing ? "Save section" : "Add section"}</button>
      {editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setName(""); setError(""); }}>Cancel</button>}
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
