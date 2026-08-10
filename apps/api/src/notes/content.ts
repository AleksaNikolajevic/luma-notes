import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
];

export function cleanNoteHtml(content: string): string {
  return sanitizeHtml(content, {
    allowedTags,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
}

export function makePreview(content: string): string {
  const separatedBlocks = content.replace(
    /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|br)\b[^>]*>/gi,
    " ",
  );

  return sanitizeHtml(separatedBlocks, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function cleanTitle(title: string): string {
  return title.trim().slice(0, 200) || "Bez naslova";
}
