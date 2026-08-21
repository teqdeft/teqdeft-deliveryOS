import type { SourceKind } from '@deliveryos/shared';

export interface ExtractedFragment {
  ordinal: number;
  locator: string;
  text: string;
  charStart: number;
  charEnd: number;
}

/** Below this a "paragraph" is a heading or a stray line, not a claim worth citing. */
const MIN_FRAGMENT_CHARS = 40;
/** Above this the citation stops being precise enough to check quickly. */
const MAX_FRAGMENT_CHARS = 1800;

/**
 * Splits a document into the addressable units a citation points at
 * (blueprint §6.1 "page, paragraph, email message or transcript timestamp").
 *
 * The locator is what a reviewer reads — "p. 3, ¶2", "12:04 — Priya",
 * "Message 2 of 6" — so verifying a requirement means glancing at the original,
 * not re-reading it.
 */
export function extractFragments(text: string, kind: SourceKind): ExtractedFragment[] {
  const normalised = text.replace(/\r\n/g, '\n').replace(/ /g, ' ');

  switch (kind) {
    case 'TRANSCRIPT':
      return fragmentTranscript(normalised);
    case 'EMAIL':
      return fragmentEmail(normalised);
    default:
      return fragmentProse(normalised);
  }
}

/** Matches "12:04", "01:12:04", "[00:12:04]", optionally followed by a speaker. */
const TIMESTAMP = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?:[-–—]\s*)?([A-Z][\w .'-]{0,40})?:?\s*/;

function fragmentTranscript(text: string): ExtractedFragment[] {
  const lines = text.split('\n');
  const fragments: ExtractedFragment[] = [];

  let buffer = '';
  let bufferStart = 0;
  let currentLocator = '';
  let cursor = 0;
  let ordinal = 0;

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length >= MIN_FRAGMENT_CHARS) {
      fragments.push({
        ordinal: ordinal++,
        locator: currentLocator || `Line ${fragments.length + 1}`,
        text: trimmed.slice(0, MAX_FRAGMENT_CHARS),
        charStart: bufferStart,
        charEnd: bufferStart + trimmed.length,
      });
    }
    buffer = '';
  };

  for (const line of lines) {
    const match = TIMESTAMP.exec(line);
    if (match) {
      flush();
      const [, time, speaker] = match;
      currentLocator = speaker ? `${time} — ${speaker.trim()}` : String(time);
      bufferStart = cursor + match[0].length;
      buffer = line.slice(match[0].length);
    } else {
      if (!buffer) bufferStart = cursor;
      buffer += (buffer ? '\n' : '') + line;
    }
    cursor += line.length + 1;

    // A speaker who talks for a page still needs citable chunks.
    if (buffer.length > MAX_FRAGMENT_CHARS) flush();
  }
  flush();

  return fragments.length > 0 ? fragments : fragmentProse(text);
}

/** Splits a thread on the headers that mail clients insert between messages. */
const EMAIL_BOUNDARY = /^\s*(?:-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}|On .{5,80} wrote:|From:\s*.+)$/im;

function fragmentEmail(text: string): ExtractedFragment[] {
  const lines = text.split('\n');
  const blocks: { text: string; start: number }[] = [];

  let buffer = '';
  let start = 0;
  let cursor = 0;

  for (const line of lines) {
    if (EMAIL_BOUNDARY.test(line) && buffer.trim().length > 0) {
      blocks.push({ text: buffer, start });
      buffer = line;
      start = cursor;
    } else {
      if (!buffer) start = cursor;
      buffer += (buffer ? '\n' : '') + line;
    }
    cursor += line.length + 1;
  }
  if (buffer.trim()) blocks.push({ text: buffer, start });

  const total = blocks.length;
  const fragments: ExtractedFragment[] = [];

  blocks.forEach((block, index) => {
    if (block.text.trim().length < MIN_FRAGMENT_CHARS) return;

    // Split each message into paragraphs too. A whole email as one fragment
    // makes every citation from it point at the same wall of text, which
    // defeats the purpose — a reviewer needs the sentence, not the message.
    const label = total > 1 ? `Message ${index + 1} of ${total}` : 'Message';
    const paragraphs = block.text.split(/\n\s*\n/);
    let paragraphNumber = 0;
    let searchFrom = 0;

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      const offsetInBlock = block.text.indexOf(paragraph, searchFrom);
      searchFrom = (offsetInBlock >= 0 ? offsetInBlock : searchFrom) + paragraph.length;
      if (trimmed.length < MIN_FRAGMENT_CHARS) continue;

      paragraphNumber += 1;
      const base = block.start + (offsetInBlock >= 0 ? offsetInBlock : 0);
      for (const [part, offset] of splitLong(trimmed)) {
        fragments.push({
          ordinal: fragments.length,
          locator: paragraphs.length > 1 ? `${label}, \u00b6${paragraphNumber}` : label,
          text: part,
          charStart: base + offset,
          charEnd: base + offset + part.length,
        });
      }
    }
  });

  return fragments.length > 0 ? fragments : fragmentProse(text);
}

/**
 * Page-and-paragraph addressing for proposals, contracts and briefs. Page
 * breaks come from the form feeds a PDF extractor leaves behind; without them
 * the whole document counts as page 1, which is still a usable locator.
 */
function fragmentProse(text: string): ExtractedFragment[] {
  const fragments: ExtractedFragment[] = [];
  const pages = text.split(/\f/);

  let cursor = 0;

  pages.forEach((page, pageIndex) => {
    const paragraphs = page.split(/\n\s*\n/);
    let paragraphNumber = 0;
    let pageCursor = cursor;

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      const offsetInPage = page.indexOf(paragraph, pageCursor - cursor);
      const absoluteStart = cursor + (offsetInPage >= 0 ? offsetInPage : 0);

      if (trimmed.length >= MIN_FRAGMENT_CHARS) {
        paragraphNumber += 1;
        for (const [part, offset] of splitLong(trimmed)) {
          fragments.push({
            ordinal: fragments.length,
            locator: pages.length > 1 ? `p. ${pageIndex + 1}, ¶${paragraphNumber}` : `¶${paragraphNumber}`,
            text: part,
            charStart: absoluteStart + offset,
            charEnd: absoluteStart + offset + part.length,
          });
        }
      }
      pageCursor = absoluteStart + paragraph.length;
    }
    cursor += page.length + 1;
  });

  return fragments;
}

/** Breaks an over-long block on sentence boundaries, keeping byte offsets honest. */
function splitLong(text: string): [string, number][] {
  if (text.length <= MAX_FRAGMENT_CHARS) return [[text, 0]];

  const parts: [string, number][] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let buffer = '';
  let offset = 0;
  let consumed = 0;

  for (const sentence of sentences) {
    if (buffer.length + sentence.length > MAX_FRAGMENT_CHARS && buffer.length > 0) {
      parts.push([buffer.trim(), offset]);
      offset = consumed;
      buffer = '';
    }
    buffer += (buffer ? ' ' : '') + sentence;
    consumed += sentence.length + 1;
  }
  if (buffer.trim()) parts.push([buffer.trim(), offset]);

  return parts;
}
