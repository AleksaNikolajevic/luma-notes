import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExtension from "@tiptap/extension-underline";
import type { Note } from "@notes/contracts";
import {
  Bold,
  ChevronLeft,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pin,
  PinOff,
  Trash2,
  Underline,
} from "lucide-react";
import { api, ApiRequestError } from "../api";

type EditorPaneProps = {
  note: Note;
  onSaved: (note: Note) => void;
  onDelete: () => void;
  onOpenSidebar: () => void;
};

type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

type Draft = {
  title: string;
  content: string;
  pinned: boolean;
};

const draftSignature = (title: string, content: string, pinned: boolean) =>
  JSON.stringify([title, content, pinned]);

export function EditorPane({
  note,
  onSaved,
  onDelete,
  onOpenSidebar,
}: EditorPaneProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [pinned, setPinned] = useState(note.pinned);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<Note | null>(null);
  const versionRef = useRef(note.version);
  const savedSignatureRef = useRef(
    draftSignature(note.title, note.content, note.pinned),
  );
  const latestDraftRef = useRef({ title, content, pinned });
  const conflictRef = useRef<Note | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  const enqueueSave = useCallback(
    (captured: Draft, updateUi = true): Promise<void> => {
      const capturedSignature = draftSignature(
        captured.title,
        captured.content,
        captured.pinned,
      );

      saveQueueRef.current = saveQueueRef.current.then(async () => {
        if (capturedSignature === savedSignatureRef.current) {
          if (mountedRef.current && updateUi) setStatus("saved");
          return;
        }

        if (mountedRef.current && updateUi) setStatus("saving");

        try {
          const { note: saved } = await api.updateNote(note.id, {
            ...captured,
            version: versionRef.current,
          });
          versionRef.current = saved.version;
          savedSignatureRef.current = capturedSignature;
          onSaved(saved);

          if (mountedRef.current && updateUi) {
            const current = latestDraftRef.current;
            const currentSignature = draftSignature(
              current.title,
              current.content,
              current.pinned,
            );
            setStatus(
              currentSignature === capturedSignature ? "saved" : "pending",
            );
          }
        } catch (caught) {
          if (
            caught instanceof ApiRequestError &&
            caught.status === 409 &&
            caught.payload.note
          ) {
            conflictRef.current = caught.payload.note;
            if (mountedRef.current && updateUi) {
              setConflict(caught.payload.note);
              setStatus("conflict");
            }
          } else if (mountedRef.current && updateUi) {
            setStatus("error");
          }
        }
      });

      return saveQueueRef.current;
    },
    [note.id, onSaved],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        heading: { levels: [2] },
        horizontalRule: false,
        strike: false,
      }),
      UnderlineExtension,
      Placeholder.configure({
        placeholder: "Počnite da pišete…",
      }),
    ],
    content: note.content,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        "aria-label": "Sadržaj beleške",
        "aria-multiline": "true",
        class: "rich-editor",
        "data-testid": "note-editor",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const nextContent = updatedEditor.getHTML();
      latestDraftRef.current = {
        ...latestDraftRef.current,
        content: nextContent,
      };
      setContent(nextContent);
      setStatus("pending");
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const captured = latestDraftRef.current;
      if (
        !conflictRef.current &&
        draftSignature(captured.title, captured.content, captured.pinned) !==
          savedSignatureRef.current
      ) {
        void enqueueSave(captured, false);
      }
    };
  }, [enqueueSave]);

  useEffect(() => {
    const signature = draftSignature(title, content, pinned);
    if (signature === savedSignatureRef.current) return;
    if (conflict) return;

    const timer = window.setTimeout(() => {
      void enqueueSave(latestDraftRef.current);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [title, content, pinned, conflict, enqueueSave]);

  const loadLatest = () => {
    if (!conflict) return;
    setTitle(conflict.title);
    setContent(conflict.content);
    setPinned(conflict.pinned);
    latestDraftRef.current = {
      title: conflict.title,
      content: conflict.content,
      pinned: conflict.pinned,
    };
    conflictRef.current = null;
    versionRef.current = conflict.version;
    savedSignatureRef.current = draftSignature(
      conflict.title,
      conflict.content,
      conflict.pinned,
    );
    editor?.commands.setContent(conflict.content, { emitUpdate: false });
    onSaved(conflict);
    setConflict(null);
    setStatus("saved");
  };

  const keepMine = () => {
    if (!conflict) return;
    versionRef.current = conflict.version;
    conflictRef.current = null;
    setConflict(null);
    setStatus("pending");
    void enqueueSave(latestDraftRef.current);
  };

  const statusLabel = {
    saved: "Sačuvano",
    pending: "Nesačuvane izmene",
    saving: "Čuvanje…",
    error: "Čuvanje nije uspelo",
    conflict: "Postoji novija verzija",
  }[status];

  return (
    <article className="editor-pane">
      <header className="editor-toolbar">
        <div className="toolbar-left">
          <button
            type="button"
            className="icon-button mobile-back-button"
            onClick={onOpenSidebar}
            aria-label="Nazad na beleške"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="format-group" aria-label="Formatiranje teksta">
            <button
              type="button"
              className={
                editor?.isActive("heading", { level: 2 }) ? "active" : ""
              }
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
              aria-label="Naslov"
              aria-pressed={editor?.isActive("heading", { level: 2 }) ?? false}
              title="Naslov"
            >
              <Heading2 size={17} />
            </button>
            <button
              type="button"
              className={editor?.isActive("bold") ? "active" : ""}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              aria-label="Podebljano"
              aria-pressed={editor?.isActive("bold") ?? false}
              title="Podebljano"
            >
              <Bold size={17} />
            </button>
            <button
              type="button"
              className={editor?.isActive("italic") ? "active" : ""}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              aria-label="Kurziv"
              aria-pressed={editor?.isActive("italic") ?? false}
              title="Kurziv"
            >
              <Italic size={17} />
            </button>
            <button
              type="button"
              className={editor?.isActive("underline") ? "active" : ""}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              aria-label="Podvučeno"
              aria-pressed={editor?.isActive("underline") ?? false}
              title="Podvučeno"
            >
              <Underline size={17} />
            </button>
            <span className="toolbar-divider" />
            <button
              type="button"
              className={editor?.isActive("bulletList") ? "active" : ""}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              aria-label="Lista"
              aria-pressed={editor?.isActive("bulletList") ?? false}
              title="Lista"
            >
              <List size={17} />
            </button>
            <button
              type="button"
              className={editor?.isActive("orderedList") ? "active" : ""}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              aria-label="Numerisana lista"
              aria-pressed={editor?.isActive("orderedList") ?? false}
              title="Numerisana lista"
            >
              <ListOrdered size={17} />
            </button>
          </div>
        </div>

        <div className="toolbar-actions">
          <span className={`save-status ${status}`} aria-live="polite">
            <span />
            {statusLabel}
          </span>
          <button
            type="button"
            className={`icon-button ${pinned ? "active" : ""}`}
            onClick={() => {
              setPinned((value) => {
                const nextPinned = !value;
                latestDraftRef.current = {
                  ...latestDraftRef.current,
                  pinned: nextPinned,
                };
                return nextPinned;
              });
              setStatus("pending");
            }}
            aria-label={pinned ? "Otkači belešku" : "Zakači belešku"}
            aria-pressed={pinned}
            title={pinned ? "Otkači belešku" : "Zakači belešku"}
          >
            {pinned ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
          <button
            type="button"
            className="icon-button danger-button"
            onClick={onDelete}
            aria-label="Obriši belešku"
            title="Obriši belešku"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {conflict && (
        <div className="conflict-banner" role="alert">
          <span>Ova beleška je izmenjena u drugoj kartici.</span>
          <div>
            <button type="button" onClick={loadLatest}>
              Učitaj noviju
            </button>
            <button type="button" onClick={keepMine}>
              Sačuvaj moju
            </button>
          </div>
        </div>
      )}

      <div className="editor-scroll">
        <div className="editor-paper">
          <time dateTime={note.updatedAt}>
            {new Intl.DateTimeFormat("sr-Latn", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(note.updatedAt))}
          </time>
          <input
            className="note-title-input"
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value;
              latestDraftRef.current = {
                ...latestDraftRef.current,
                title: nextTitle,
              };
              setTitle(nextTitle);
              setStatus("pending");
            }}
            placeholder="Naslov"
            maxLength={200}
            aria-label="Naslov beleške"
          />
          <EditorContent editor={editor} />
        </div>
      </div>
    </article>
  );
}
