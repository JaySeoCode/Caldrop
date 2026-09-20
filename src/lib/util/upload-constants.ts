/**
 * Upload limits shared by the browser and the server.
 *
 * Kept in its own module because the client bundle must not pull in the
 * validation code (which uses node:crypto). The browser uses these for instant
 * feedback; the server enforces them for real in `upload.ts`.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 8000;

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/**
 * PDFs are read by the model page by page, so the cap is about tokens and
 * latency as much as bandwidth.
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Pages the model is asked to read in one go. A syllabus, not a textbook. */
export const MAX_PDF_PAGES = 10;
export const PDF_TYPE = 'application/pdf';
