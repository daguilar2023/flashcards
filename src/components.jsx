import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Prism from "prismjs";
import { createPortal } from "react-dom";
import { sanitize, safeImage } from "./lib/model";

export function Icon({ name, size = 20, ...props }) {
  const paths = {
    cloud: <path d="M7 18h11a4 4 0 0 0 0-8h-1a6 6 0 0 0-11-3 5.5 5.5 0 0 0 1 11Z" />,
    stack: (
      <>
        <rect x="5" y="3" width="14" height="16" rx="3" />
        <path d="M3 7v12a2 2 0 0 0 2 2h10M9 8h6M9 12h4" />
      </>
    ),
    home: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
        <path d="M21 2v4m-2-2h4" />
      </>
    ),
    book: (
      <>
        <path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" />
      </>
    ),
    edit: (
      <>
        <path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15Z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8" cy="8" r="1" />
        <path d="m3 17 6-6 4 4 3-3 5 5" />
      </>
    ),
    shuffle: (
      <>
        <path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 4-2 5-5m2-2c1-3 3-5 5-5h3m-4-4 4 4-4 4" />
      </>
    ),
    flip: (
      <>
        <path d="M4 9a8 8 0 0 1 14-4l2 2M20 3v4h-4M20 15a8 8 0 0 1-14 4l-2-2M4 21v-4h4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.stack}
    </svg>
  );
}

export function Modal({ title, children, onClose, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={`modal ${className}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}

export function RichContent({ html, image, side = "Card" }) {
  const ref = useRef(null);
  const containerRef = useRef(null);
  const [scrollable, setScrollable] = useState(false);
  const clean = sanitize(html);
  // Keep React from resetting Prism's highlighted markup on unrelated renders.
  const markup = useMemo(() => ({ __html: clean }), [clean]);
  useEffect(() => {
    if (ref.current) Prism.highlightAllUnder(ref.current);
  }, [clean]);
  useEffect(() => {
    const container = containerRef.current;
    const measure = () => setScrollable(
      side === "Answer" && container.scrollHeight > container.clientHeight + 2,
    );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [clean, side]);
  return (
    <>
    <div
      ref={containerRef}
      className={`card-content ${side === "Answer" ? "answer-content" : ""}`}
      tabIndex={scrollable ? 0 : undefined}
      aria-label={scrollable ? "Answer; scroll for full content" : undefined}
    >
      {safeImage(image) && (
        <img
          className="card-image"
          src={safeImage(image)}
          alt={`${side} illustration`}
        />
      )}
      <div
        ref={ref}
        className="rich-content"
        dangerouslySetInnerHTML={markup}
      />
    </div>
    {scrollable && <p className="answer-scroll-hint">Scroll within the answer to read it all.</p>}
    </>
  );
}

export function RichEditor({ side, html, image, onChange, onImage, onError }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const selectionRef = useRef(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  // This component is keyed to the card; typing does not recreate the selection.
  useLayoutEffect(() => {
    ref.current.innerHTML = sanitize(html);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const emit = () => onChange(ref.current.innerHTML);
  function format(command) {
    ref.current.focus();
    document.execCommand(command, false);
    emit();
  }
  function openCode() {
    const selection = window.getSelection();
    selectionRef.current =
      selection?.rangeCount && ref.current.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    setCode(selectionRef.current?.toString() || "");
    setCodeOpen(true);
  }
  function insertCode(event) {
    event.preventDefault();
    event.stopPropagation();
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.className = `language-${language}`;
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    const range = selectionRef.current;
    if (range && ref.current.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(pre);
    } else ref.current.appendChild(pre);
    pre.after(document.createElement("br"));
    emit();
    setCodeOpen(false);
    ref.current.focus();
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.type))
      return onError("Choose a PNG, JPEG, GIF, WebP, AVIF, or BMP image.");
    if (file.size > 5 * 1024 * 1024)
      return onError("Choose an image smaller than 5 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      if (ref.current?.isConnected) onImage(reader.result);
    };
    reader.onerror = () => {
      if (ref.current?.isConnected)
        onError("This image could not be read. Try another file.");
    };
    reader.readAsDataURL(file);
  }
  return (
    <div className="editor-side">
      <div className="editor-side-heading">
        <span className="eyebrow">{side}</span>
        <span className="muted">
          {side === "Front"
            ? "The question or prompt"
            : "The answer or explanation"}
        </span>
      </div>
      <div className="format-toolbar">
        {[
          ["bold", "B"],
          ["italic", "I"],
          ["underline", "U"],
          ["insertUnorderedList", "• List"],
        ].map(([command, label]) => (
          <button
            key={command}
            type="button"
            aria-label={`${side} ${command}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => format(command)}
            className={command}
          >
            {label}
          </button>
        ))}
        <span className="toolbar-divider" />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openCode}
          aria-label={`${side} insert code block`}
        >
          {"</>"}
        </button>
        <button
          type="button"
          className="image-upload"
          onClick={() => fileRef.current.click()}
        >
          <Icon name="image" size={16} /> Image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
          hidden
          onChange={upload}
        />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={`${side} text`}
        aria-multiline="true"
        data-placeholder={
          side === "Front"
            ? "What do you want to remember?"
            : "Write the answer here…"
        }
        className="rich-input rich-content"
        onInput={emit}
        onPaste={(event) => {
          event.preventDefault();
          const data = event.clipboardData;
          const pasted = data.getData("text/html");
          if (pasted)
            document.execCommand("insertHTML", false, sanitize(pasted));
          else
            document.execCommand(
              "insertText",
              false,
              data.getData("text/plain"),
            );
          emit();
        }}
      />
      {image && (
        <div className="image-preview">
          <img src={image} alt={`${side} preview`} />
          <button
            className="icon-button"
            type="button"
            onClick={() => onImage("")}
            aria-label={`Remove ${side.toLowerCase()} image`}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {codeOpen && (
        <Modal
          title="Insert a code block"
          onClose={() => setCodeOpen(false)}
          className="code-modal"
        >
          <form onSubmit={insertCode}>
            <label className="field-label">
              Language
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {[
                  "javascript",
                  "typescript",
                  "python",
                  "java",
                  "c",
                  "cpp",
                  "go",
                  "rust",
                  "bash",
                  "json",
                  "markdown",
                  "html",
                  "css",
                ].map((lang) => (
                  <option key={lang}>{lang}</option>
                ))}
              </select>
            </label>
            <textarea
              aria-label="Code"
              className="code-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
              spellCheck="false"
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  event.preventDefault();
                  const { selectionStart, selectionEnd } = event.target;
                  setCode(
                    code.slice(0, selectionStart) +
                      "  " +
                      code.slice(selectionEnd),
                  );
                  requestAnimationFrame(() =>
                    event.target.setSelectionRange(
                      selectionStart + 2,
                      selectionStart + 2,
                    ),
                  );
                }
              }}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setCodeOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={!code.trim()}>
                Insert code
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
