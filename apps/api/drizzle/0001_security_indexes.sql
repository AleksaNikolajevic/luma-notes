CREATE INDEX IF NOT EXISTS "notes_owner_list_idx"
  ON "notes" USING btree ("owner_id", "pinned", "updated_at", "id");
