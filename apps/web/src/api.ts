import type {
  ApiError,
  AuthConfig,
  AuthResponse,
  LoginInput,
  Note,
  NoteListResponse,
  RegisterInput,
  UpdateNoteInput,
} from "@notes/contracts";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: ApiError & { note?: Note },
  ) {
    super(message);
  }
}

export type NoteListOptions = {
  cursor?: string;
  search?: string;
  limit?: number;
};

export function buildNoteListPath(options: NoteListOptions = {}): string {
  const query = new URLSearchParams();
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.search?.trim()) query.set("search", options.search.trim());
  if (options.limit) query.set("limit", String(options.limit));
  const serialized = query.toString();
  return `/api/notes${serialized ? `?${serialized}` : ""}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = payload as ApiError;
    throw new ApiRequestError(
      error.error ?? "Zahtev nije uspeo.",
      response.status,
      error,
    );
  }
  return payload as T;
}

export const api = {
  me: () => request<AuthResponse>("/api/auth/me"),
  authConfig: () => request<AuthConfig>("/api/auth/config"),
  register: (input: RegisterInput) =>
    request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: LoginInput) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  notes: (options: NoteListOptions = {}) =>
    request<NoteListResponse>(buildNoteListPath(options)),
  note: (id: string) => request<{ note: Note }>(`/api/notes/${id}`),
  createNote: () =>
    request<{ note: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Nova beleška", content: "" }),
    }),
  updateNote: (id: string, input: UpdateNoteInput) =>
    request<{ note: Note }>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteNote: (id: string) =>
    request<void>(`/api/notes/${id}`, {
      method: "DELETE",
    }),
};
