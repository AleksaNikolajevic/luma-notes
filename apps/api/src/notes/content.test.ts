import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanNoteHtml, cleanTitle, makePreview } from "./content.js";

test("note HTML keeps basic formatting and removes unsafe markup", () => {
  const cleaned = cleanNoteHtml(
    '<h2>Plan</h2><p onclick="steal()">Važno</p><script>alert(1)</script><img src=x onerror=steal()>',
  );

  assert.equal(cleaned.includes("<h2>Plan</h2>"), true);
  assert.equal(cleaned.includes("<p>Važno</p>"), true);
  assert.equal(cleaned.includes("onclick"), false);
  assert.equal(cleaned.includes("script"), false);
  assert.equal(cleaned.includes("img"), false);
});

test("preview is plain, compact text and empty titles receive a fallback", () => {
  assert.equal(
    makePreview("<p>Prvi   red</p><p>Drugi red</p>"),
    "Prvi red Drugi red",
  );
  assert.equal(cleanTitle("   "), "Bez naslova");
});
