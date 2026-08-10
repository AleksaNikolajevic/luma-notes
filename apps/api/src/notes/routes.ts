import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  and,
  count as drizzleCount,
  desc,
  eq,
  ilike,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  createNoteSchema,
  noteIdSchema,
  noteListQuerySchema,
  updateNoteSchema,
  type Note,
  type NoteSummary,
} from "@notes/contracts";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { notes, type NoteRow } from "../db/schema.js";
import { requireUser } from "../auth/session.js";
import { cleanNoteHtml, cleanTitle, makePreview } from "./content.js";

const cursorSchema = z.object({
  p: z.boolean(),
  u: z.string().datetime(),
  i: z.string().uuid(),
});

type Cursor = z.infer<typeof cursorSchema>;

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  content: row.content,
  preview: row.preview,
  pinned: row.pinned,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toNoteSummary = (row: NoteRow): NoteSummary => ({
  id: row.id,
  title: row.title,
  preview: row.preview,
  pinned: row.pinned,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const encodeCursor = (row: NoteRow): string =>
  Buffer.from(
    JSON.stringify({
      p: row.pinned,
      u: row.updatedAt.toISOString(),
      i: row.id,
    } satisfies Cursor),
  ).toString("base64url");

const decodeCursor = (value: string | undefined): Cursor | null => {
  if (!value) return null;
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }
};

const noteBytes = (title: string, content: string): number =>
  Buffer.byteLength(title, "utf8") + Buffer.byteLength(content, "utf8");

const validationError = {
  error: "Podaci beleške nisu ispravni.",
  code: "VALIDATION_ERROR",
};

const quotaError = {
  error: "Dostignuta je dozvoljena količina sačuvanih beleški.",
  code: "STORAGE_QUOTA_EXCEEDED",
};

const noteTooLargeError = {
  error: "Beleška je veća od dozvoljene veličine.",
  code: "NOTE_TOO_LARGE",
};

export const notesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const parsed = noteListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(validationError);
    }

    const cursor = decodeCursor(parsed.data.cursor);
    if (parsed.data.cursor && !cursor) {
      return reply.code(400).send({
        error: "Cursor nije ispravan.",
        code: "INVALID_CURSOR",
      });
    }

    const search = parsed.data.search;
    const escapedSearch = search?.replace(/[\\%_]/g, "\\$&");
    const ownerFilter = eq(notes.ownerId, user.id);
    const searchFilter = escapedSearch
      ? or(
          ilike(notes.title, `%${escapedSearch}%`),
          ilike(notes.preview, `%${escapedSearch}%`),
        )
      : undefined;

    const cursorTime = cursor ? new Date(cursor.u) : undefined;
    const sameSectionAfter =
      cursor && cursorTime
        ? or(
            lt(notes.updatedAt, cursorTime),
            and(eq(notes.updatedAt, cursorTime), lt(notes.id, cursor.i)),
          )
        : undefined;
    const cursorFilter =
      cursor && sameSectionAfter
        ? cursor.p
          ? or(
              and(eq(notes.pinned, true), sameSectionAfter),
              eq(notes.pinned, false),
            )
          : and(eq(notes.pinned, false), sameSectionAfter)
        : undefined;

    const pageSize = Math.min(parsed.data.limit ?? config.notesPageSize, 100);
    const rows = await db
      .select()
      .from(notes)
      .where(and(ownerFilter, searchFilter, cursorFilter))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt), desc(notes.id))
      .limit(pageSize + 1);

    const hasNextPage = rows.length > pageSize;
    const page = hasNextPage ? rows.slice(0, pageSize) : rows;
    const last = page.at(-1);

    return {
      notes: page.map(toNoteSummary),
      nextCursor: hasNextPage && last ? encodeCursor(last) : null,
    };
  });

  app.get("/:id", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const params = noteIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(validationError);
    }

    const [note] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, params.data.id), eq(notes.ownerId, user.id)))
      .limit(1);
    if (!note) {
      return reply.code(404).send({
        error: "Beleška nije pronađena.",
        code: "NOT_FOUND",
      });
    }
    return { note: toNote(note) };
  });

  app.post("/", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const parsed = createNoteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(validationError);
    }

    const title = cleanTitle(parsed.data.title);
    const content = cleanNoteHtml(parsed.data.content);
    const incomingBytes = noteBytes(title, content);
    if (incomingBytes > config.maxNoteBytes) {
      return reply.code(413).send(noteTooLargeError);
    }

    const outcome = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"notes:" + user.id}, 0))`,
      );
      const [usage] = await transaction
        .select({
          noteCount: drizzleCount(),
          totalBytes: sql<string>`coalesce(sum(octet_length(${notes.title}) + octet_length(${notes.content})), 0)::text`,
        })
        .from(notes)
        .where(eq(notes.ownerId, user.id));

      const count = Number(usage?.noteCount ?? 0);
      const totalBytes = Number(usage?.totalBytes ?? 0);
      if (
        count >= config.maxNotesPerUser ||
        totalBytes + incomingBytes > config.maxTotalNoteBytesPerUser
      ) {
        return { kind: "quota" } as const;
      }

      const [created] = await transaction
        .insert(notes)
        .values({
          id: randomUUID(),
          ownerId: user.id,
          title,
          content,
          preview: makePreview(content),
        })
        .returning();
      return { kind: "created", note: created } as const;
    });

    if (outcome.kind === "quota") {
      return reply.code(409).send(quotaError);
    }
    if (!outcome.note) {
      throw new Error("Beleška nije kreirana.");
    }
    return reply.code(201).send({ note: toNote(outcome.note) });
  });

  app.patch("/:id", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const params = noteIdSchema.safeParse(request.params);
    const body = updateNoteSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send(validationError);
    }

    const title = cleanTitle(body.data.title);
    const content = cleanNoteHtml(body.data.content);
    const incomingBytes = noteBytes(title, content);
    if (incomingBytes > config.maxNoteBytes) {
      return reply.code(413).send(noteTooLargeError);
    }

    const outcome = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"notes:" + user.id}, 0))`,
      );

      const [current] = await transaction
        .select()
        .from(notes)
        .where(and(eq(notes.id, params.data.id), eq(notes.ownerId, user.id)))
        .limit(1);
      if (!current) return { kind: "not-found" } as const;
      if (current.version !== body.data.version) {
        return { kind: "conflict", note: current } as const;
      }

      const [usage] = await transaction
        .select({
          totalBytes: sql<string>`coalesce(sum(octet_length(${notes.title}) + octet_length(${notes.content})), 0)::text`,
        })
        .from(notes)
        .where(eq(notes.ownerId, user.id));
      const projectedBytes =
        Number(usage?.totalBytes ?? 0) -
        noteBytes(current.title, current.content) +
        incomingBytes;
      if (projectedBytes > config.maxTotalNoteBytesPerUser) {
        return { kind: "quota" } as const;
      }

      const [updated] = await transaction
        .update(notes)
        .set({
          title,
          content,
          preview: makePreview(content),
          pinned: body.data.pinned,
          version: body.data.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notes.id, params.data.id),
            eq(notes.ownerId, user.id),
            eq(notes.version, body.data.version),
          ),
        )
        .returning();
      return { kind: "updated", note: updated } as const;
    });

    if (outcome.kind === "not-found") {
      return reply.code(404).send({
        error: "Beleška nije pronađena.",
        code: "NOT_FOUND",
      });
    }
    if (outcome.kind === "conflict") {
      return reply.code(409).send({
        error:
          "Beleška je promenjena u drugoj kartici. Učitana je novija verzija.",
        code: "VERSION_CONFLICT",
        note: toNote(outcome.note),
      });
    }
    if (outcome.kind === "quota") {
      return reply.code(409).send(quotaError);
    }
    if (!outcome.note) {
      throw new Error("Beleška nije sačuvana.");
    }
    return { note: toNote(outcome.note) };
  });

  app.delete("/:id", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const params = noteIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(validationError);
    }

    const deleted = await db
      .delete(notes)
      .where(and(eq(notes.id, params.data.id), eq(notes.ownerId, user.id)))
      .returning({ id: notes.id });

    if (deleted.length === 0) {
      return reply.code(404).send({
        error: "Beleška nije pronađena.",
        code: "NOT_FOUND",
      });
    }

    return reply.code(204).send();
  });
};
