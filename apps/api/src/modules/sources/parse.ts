import mammoth from 'mammoth';

export interface ParseResult {
  text: string;
  supported: boolean;
  note?: string;
}

/**
 * Turns an uploaded file into plain text for fragmenting.
 *
 * Anything we cannot read is marked UNSUPPORTED rather than silently ingested
 * as empty — §7.1 requires unsupported files to be "clearly flagged", and a
 * source that produced no text must never look like a source that genuinely
 * said nothing.
 */
export async function parseDocument(filename: string, mimeType: string, bytes: Buffer): Promise<ParseResult> {
  const lower = filename.toLowerCase();

  if (mimeType.startsWith('text/') || /\.(txt|md|csv|json|vtt|srt)$/.test(lower)) {
    return { text: bytes.toString('utf8'), supported: true };
  }

  if (/\.(docx|dotx)$/.test(lower)) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return { text: result.value, supported: true };
  }

  if (/\.pdf$/.test(lower) || mimeType === 'application/pdf') {
    try {
      // pdf-parse is CommonJS and runs an example file on bare import, so it is
      // required lazily from its implementation path.
      const mod = await import('pdf-parse/lib/pdf-parse.js');
      const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string; numpages: number }>;
      const parsed = await pdfParse(bytes);
      const text = parsed.text.trim();
      if (!text) {
        return {
          text: '',
          supported: false,
          note: 'The PDF contains no extractable text. It is probably a scan and needs OCR before it can be analysed.',
        };
      }
      return { text: parsed.text, supported: true };
    } catch (err) {
      return { text: '', supported: false, note: `PDF could not be read: ${String(err)}` };
    }
  }

  if (/\.(doc|xls|xlsx|ppt|pptx)$/.test(lower)) {
    return {
      text: '',
      supported: false,
      note: `${lower.split('.').pop()?.toUpperCase()} is not supported yet. Export to PDF, DOCX or plain text and re-upload.`,
    };
  }

  if (/\.(png|jpg|jpeg|gif|webp|svg|fig)$/.test(lower)) {
    return {
      text: '',
      supported: false,
      note: 'Image and design files are stored as evidence but carry no extractable requirements text.',
    };
  }

  return { text: '', supported: false, note: `Unsupported file type: ${mimeType || 'unknown'}` };
}
