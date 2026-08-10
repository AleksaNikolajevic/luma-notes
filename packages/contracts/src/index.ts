import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Unesite ispravnu email adresu.")
  .max(254)
  .transform((email) => email.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Lozinka mora imati najmanje 8 karaktera.")
  .max(128, "Lozinka je predugačka.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Unesite ime.").max(80),
  email: emailSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().min(12).max(256).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Unesite lozinku.").max(128),
});

export const createNoteSchema = z.object({
  title: z.string().trim().max(200).default("Nova beleška"),
  content: z.string().max(100_000).default(""),
});

export const updateNoteSchema = z.object({
  title: z.string().trim().max(200),
  content: z.string().max(100_000),
  pinned: z.boolean(),
  version: z.number().int().positive(),
});

export const noteIdSchema = z.object({
  id: z.string().uuid(),
});

export const noteListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(10).max(100).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export type User = {
  id: string;
  name: string;
  email: string;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  preview: string;
  pinned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type NoteSummary = Omit<Note, "content">;

export type AuthResponse = {
  user: User;
};

export type AuthConfig = {
  registrationMode: "closed" | "invite" | "open";
};

export type NoteListResponse = {
  notes: NoteSummary[];
  nextCursor: string | null;
};

export type ApiError = {
  error: string;
  code?: string;
  issues?: Record<string, string>;
};
