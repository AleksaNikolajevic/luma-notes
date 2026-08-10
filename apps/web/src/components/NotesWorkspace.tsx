import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteSummary, User } from "@notes/contracts";
import { FileText, LogOut, Plus, Search, Sparkles, X } from "lucide-react";
import { api } from "../api";
import { EditorPane } from "./EditorPane";

type NotesWorkspaceProps = {
  user: User;
  onSignedOut: () => void;
};

const sortNotes = (notes: NoteSummary[]) =>
  [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

const noteMatchesSearch = (note: NoteSummary, search: string) => {
  const needle = search.trim().toLocaleLowerCase("sr-Latn");
  if (!needle) return true;
  return (
    note.title.toLocaleLowerCase("sr-Latn").includes(needle) ||
    note.preview.toLocaleLowerCase("sr-Latn").includes(needle)
  );
};

const toNoteSummary = (note: Note): NoteSummary => ({
  id: note.id,
  title: note.title,
  preview: note.preview,
  pinned: note.pinned,
  version: note.version,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

const formatNoteDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return sameDay
    ? new Intl.DateTimeFormat("sr-Latn", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : new Intl.DateTimeFormat("sr-Latn", {
        day: "numeric",
        month: "short",
      }).format(date);
};

export function NotesWorkspace({ user, onSignedOut }: NotesWorkspaceProps) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const requestSequenceRef = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    let active = true;
    api
      .notes({ search: debouncedSearch })
      .then(({ notes: loadedNotes, nextCursor: followingCursor }) => {
        if (!active || requestSequence !== requestSequenceRef.current) return;
        const sorted = sortNotes(loadedNotes);
        setNotes(sorted);
        setNextCursor(followingCursor);
        setActiveNote((current) =>
          current && sorted.some((note) => note.id === current.id)
            ? current
            : null,
        );
        setActiveId((current) =>
          current && sorted.some((note) => note.id === current)
            ? current
            : (sorted[0]?.id ?? null),
        );
      })
      .catch(() => {
        if (active && requestSequence === requestSequenceRef.current) {
          setLoadError("Beleške trenutno nisu dostupne.");
        }
      })
      .finally(() => {
        if (active && requestSequence === requestSequenceRef.current) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    if (!activeId) return;
    if (activeNote?.id === activeId) return;

    let active = true;
    setLoadingNote(true);
    api
      .note(activeId)
      .then(({ note }) => {
        if (active) setActiveNote(note);
      })
      .catch(() => {
        if (active) setLoadError("Beleška trenutno nije dostupna.");
      })
      .finally(() => {
        if (active) setLoadingNote(false);
      });

    return () => {
      active = false;
    };
  }, [activeId, activeNote?.id]);

  const createNote = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { note } = await api.createNote();
      setNotes((current) => sortNotes([note, ...current]));
      setActiveNote(note);
      setActiveId(note.id);
      setSearch("");
      setSidebarVisible(false);
    } catch {
      setLoadError("Nova beleška nije kreirana. Pokušajte ponovo.");
    } finally {
      setCreating(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.notes({
        cursor: nextCursor,
        search: debouncedSearch,
      });
      setNotes((current) => {
        const knownIds = new Set(current.map((note) => note.id));
        return sortNotes([
          ...current,
          ...result.notes.filter((note) => !knownIds.has(note.id)),
        ]);
      });
      setNextCursor(result.nextCursor);
    } catch {
      setLoadError("Starije beleške trenutno nisu dostupne.");
    } finally {
      setLoadingMore(false);
    }
  };

  const saveNote = useCallback(
    (saved: Note) => {
      const summary = toNoteSummary(saved);
      setNotes((current) => {
        const updated = current.map((note) =>
          note.id === saved.id ? summary : note,
        );
        return sortNotes(
          debouncedSearch
            ? updated.filter((note) => noteMatchesSearch(note, debouncedSearch))
            : updated,
        );
      });
      setActiveNote((current) => (current?.id === saved.id ? saved : current));
    },
    [debouncedSearch],
  );

  const deleteNote = async (note: Note | NoteSummary) => {
    const confirmed = window.confirm(`Obrisati belešku „${note.title}”?`);
    if (!confirmed) return;

    try {
      await api.deleteNote(note.id);
      setNotes((current) => {
        const remaining = current.filter((item) => item.id !== note.id);
        if (activeId === note.id) {
          setActiveNote(null);
          setActiveId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
      setSidebarVisible(true);
    } catch {
      setLoadError("Beleška nije obrisana. Pokušajte ponovo.");
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      onSignedOut();
    }
  };

  const selectNote = (id: string) => {
    if (id !== activeId) setActiveNote(null);
    setActiveId(id);
    setSidebarVisible(false);
  };

  return (
    <main className={`notes-shell ${sidebarVisible ? "sidebar-visible" : ""}`}>
      <aside className="notes-sidebar" aria-label="Lista beleški">
        <header className="sidebar-header">
          <div>
            <span className="sidebar-kicker">Moj prostor</span>
            <h1>Beleške</h1>
          </div>
          <button
            className="icon-button new-note-button"
            type="button"
            onClick={createNote}
            disabled={creating}
            aria-label="Nova beleška"
            data-testid="new-note"
            title="Nova beleška"
          >
            <Plus size={20} strokeWidth={2.2} />
          </button>
        </header>

        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setLoading(true);
              setLoadError("");
            }}
            placeholder="Pretraži beleške"
            aria-label="Pretraži beleške"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setLoading(true);
                setLoadError("");
              }}
              aria-label="Obriši pretragu"
            >
              <X size={15} />
            </button>
          )}
        </label>

        <div className="notes-count">
          <span>
            {notes.length}
            {nextCursor ? "+" : ""} beleški
          </span>
          <span>
            {search !== debouncedSearch || loading ? "Pretraga…" : "Privatno"}
          </span>
        </div>

        <div className="notes-list">
          {loading && (
            <div className="list-state">
              <span className="small-spinner" />
              Učitavamo beleške…
            </div>
          )}

          {!loading && loadError && (
            <div className="list-state error-state" role="alert">
              {loadError}
              <button type="button" onClick={() => setLoadError("")}>
                Zatvori
              </button>
            </div>
          )}

          {!loading && !loadError && notes.length === 0 && (
            <div className="list-state empty-list-state">
              <FileText size={23} aria-hidden="true" />
              <strong>{search ? "Nema rezultata" : "Još nema beleški"}</strong>
              <span>
                {search
                  ? "Probajte drugačiji pojam."
                  : "Kreirajte prvu belešku i zapišite ideju."}
              </span>
              {!search && (
                <button type="button" onClick={createNote}>
                  <Plus size={15} />
                  Nova beleška
                </button>
              )}
            </div>
          )}

          {notes.map((note) => (
            <button
              type="button"
              className={`note-row ${activeId === note.id ? "active" : ""}`}
              key={note.id}
              onClick={() => selectNote(note.id)}
              aria-current={activeId === note.id ? "page" : undefined}
            >
              <span className="note-row-heading">
                <strong>{note.title || "Bez naslova"}</strong>
                <time dateTime={note.updatedAt}>
                  {formatNoteDate(note.updatedAt)}
                </time>
              </span>
              <span className="note-row-preview">
                {note.preview || "Prazna beleška"}
              </span>
              {note.pinned && <span className="pinned-label">Zakačeno</span>}
            </button>
          ))}

          {nextCursor && search === debouncedSearch && (
            <button
              type="button"
              className="load-more-button"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Učitavanje…" : "Učitaj starije beleške"}
            </button>
          )}
        </div>

        <footer className="account-row">
          <span className="user-avatar" aria-hidden="true">
            {user.name.slice(0, 1).toLocaleUpperCase("sr-Latn")}
          </span>
          <span className="account-copy">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={signOut}
            aria-label="Odjavi se"
            title="Odjavi se"
          >
            <LogOut size={17} />
          </button>
        </footer>
      </aside>

      <section className="editor-region" aria-label="Editor beleške">
        {loadingNote && activeId ? (
          <div className="empty-editor" aria-label="Učitavanje beleške">
            <span className="small-spinner" />
            <p>Učitavanje beleške…</p>
          </div>
        ) : activeNote ? (
          <EditorPane
            key={activeNote.id}
            note={activeNote}
            onSaved={saveNote}
            onDelete={() => deleteNote(activeNote)}
            onOpenSidebar={() => setSidebarVisible(true)}
          />
        ) : (
          <div className="empty-editor">
            <span className="empty-editor-icon">
              <Sparkles size={25} />
            </span>
            <h2>Spremni za novu ideju?</h2>
            <p>Izaberite postojeću belešku ili napravite novu.</p>
            <button
              className="primary-button compact"
              type="button"
              onClick={createNote}
            >
              <Plus size={17} />
              Nova beleška
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
