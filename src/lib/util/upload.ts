/**
 * Screenshot upload validation.
 *
 * The declared MIME type of an upload is attacker-controlled, so the real check
 * is the magic-byte sniff below; the declared type only has to agree with it.
 * Images are never written to disk or to public storage - they are turned into
 * a data URL for the model call and dropped, and only a sha-256 digest is kept
 * for the audit trail.
 */
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '@/lib/util/errors';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_TEXT_LENGTH,
  PDF_TYPE,
  type AllowedImageType,
} from '@/lib/util/upload-constants';

export {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_TEXT_LENGTH,
  ALLOWED_IMAGE_TYPES,
  PDF_TYPE,
  type AllowedImageType,
} from '@/lib/util/upload-constants';

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Detects the real image type from the file header. Returns null for anything else. */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

export interface ValidatedImage {
  dataUrl: string;
  mimeType: AllowedImageType;
  byteLength: number;
  sha256: string;
}

export async function validateImageUpload(file: File): Promise<ValidatedImage> {
  if (file.size === 0) {
    throw new AppError('INVALID_INPUT', 'The uploaded file is empty.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `Screenshots must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller.`,
    );
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Only PNG, JPEG, WebP and GIF screenshots are supported.',
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Screenshot is too large.');
  }

  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'That file is not a supported image.');
  }
  // A declared type that disagrees with the bytes is not refused: Android share
  // targets routinely label a PNG screenshot "image/jpeg". The sniffed type is
  // what gets used downstream, and it is already restricted to real images.

  return {
    dataUrl: `data:${sniffed};base64,${buffer.toString('base64')}`,
    mimeType: sniffed,
    byteLength: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export function validateText(raw: unknown, field = 'text'): string {
  if (typeof raw !== 'string') {
    throw new AppError('INVALID_INPUT', `${field} must be a string.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new AppError('INVALID_INPUT', `${field} is empty.`);
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new AppError('PAYLOAD_TOO_LARGE', `${field} is too long (max ${MAX_TEXT_LENGTH} characters).`);
  }
  return trimmed;
}

/** Clarification rounds kept per input; older rounds are dropped first. */
export const MAX_CLARIFICATION_ROUNDS = 5;
/** Matches the schema's cap on the model's `explanation`, which is the question. */
const MAX_QUESTION_LENGTH = 1000;

export function validateClarifications(
  raw: unknown,
): Array<{ question: string; answer: string }> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new AppError('INVALID_INPUT', 'clarifications must be an array.');
  }
  return raw.slice(-MAX_CLARIFICATION_ROUNDS).map((turn: unknown) => {
    const { question, answer } = (turn ?? {}) as { question?: unknown; answer?: unknown };
    const validQuestion = validateText(question, 'clarification question');
    if (validQuestion.length > MAX_QUESTION_LENGTH) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'clarification question is too long.');
    }
    return { question: validQuestion, answer: validateText(answer, 'clarification answer') };
  });
}

export interface ValidatedDocument {
  dataUrl: string;
  /** Sanitised, so a crafted name cannot travel into the model prompt. */
  filename: string;
  byteLength: number;
  pageCount: number;
  sha256: string;
}

/**
 * Page count via a real parse, because page objects usually live inside
 * compressed object streams where grepping the bytes would be wrong. A file
 * that cannot be parsed is refused rather than guessed at: the cap exists to
 * bound what one request costs, so an unknown count is not an acceptable
 * answer.
 */
async function countPdfPages(bytes: Buffer): Promise<number> {
  let pages: number;
  try {
    const document = await PDFDocument.load(bytes, {
      // Encrypted-but-readable files still have a readable page tree; a truly
      // unreadable one throws here and is refused.
      ignoreEncryption: true,
      updateMetadata: false,
    });
    // A truncated file can load and then fail on the page tree, so the count is
    // taken inside the same guard.
    pages = document.getPageCount();
  } catch {
    throw new AppError('INVALID_INPUT', 'That PDF could not be read. Try exporting it again.');
  }

  if (pages < 1) {
    throw new AppError('INVALID_INPUT', 'That PDF has no pages.');
  }
  return pages;
}

/** True when the bytes really start a PDF (`%PDF-`). */
export function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
}

function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'document.pdf';
  const cleaned = base.replace(/[^\w.\- ]+/g, '_').slice(0, 80).trim();
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned || 'document'}.pdf`;
}

/**
 * Same contract as `validateImageUpload`: the declared type only has to be the
 * PDF type, and the header sniff is what actually decides. The bytes are never
 * stored - they become a data URL for the model call and are dropped.
 */
export async function validatePdfUpload(file: File): Promise<ValidatedDocument> {
  if (file.size === 0) {
    throw new AppError('INVALID_INPUT', 'The uploaded file is empty.');
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `PDFs must be ${MAX_PDF_BYTES / (1024 * 1024)}MB or smaller.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'That PDF is too large.');
  }
  if (!isPdf(buffer)) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'That file is not a PDF.');
  }

  const pageCount = await countPdfPages(buffer);
  if (pageCount > MAX_PDF_PAGES) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `PDFs must be ${MAX_PDF_PAGES} pages or fewer (this one has ${pageCount}). ` +
        'Split it, or send just the pages with the schedule.',
    );
  }

  return {
    dataUrl: `data:${PDF_TYPE};base64,${buffer.toString('base64')}`,
    filename: safeFilename(file.name || 'document.pdf'),
    byteLength: buffer.byteLength,
    pageCount,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
