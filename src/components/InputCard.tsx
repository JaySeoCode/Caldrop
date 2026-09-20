'use client';

import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXT_LENGTH,
  PDF_TYPE,
} from '@/lib/util/upload-constants';

interface InputCardProps {
  busy: boolean;
  onAnalyze: (input: { text?: string; image?: File }) => void;
  /** Pre-filled content, e.g. a screenshot shared in from the Android share sheet. */
  initial?: { text?: string; image?: File } | null;
}

function isImage(file: File): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

function isPdf(file: File): boolean {
  return file.type === PDF_TYPE;
}

function sizeLimit(file: File): number {
  return isPdf(file) ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}

function megabytes(bytes: number): number {
  return bytes / (1024 * 1024);
}

export function InputCard({ busy, onAnalyze, initial }: InputCardProps) {
  const [text, setText] = useState(initial?.text ?? '');
  const [image, setImage] = useState<File | null>(initial?.image ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    initial?.image ? URL.createObjectURL(initial.image) : null,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((file: File) => {
    // Mirrors the server-side rules so obvious mistakes fail instantly; the
    // server re-validates everything, including the actual file signature.
    if (!isImage(file) && !isPdf(file)) {
      setLocalError('Attach a PNG, JPEG, WebP or GIF screenshot, or a PDF.');
      return;
    }
    if (file.size > sizeLimit(file)) {
      setLocalError(
        isPdf(file)
          ? `PDFs must be ${megabytes(MAX_PDF_BYTES)}MB or smaller.`
          : `Screenshots must be ${megabytes(MAX_IMAGE_BYTES)}MB or smaller.`,
      );
      return;
    }
    setLocalError(null);
    setImage(file);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      // A PDF has no inline preview; the file name is shown instead.
      return isImage(file) ? URL.createObjectURL(file) : null;
    });
  }, []);

  const clearImage = () => {
    setImage(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    if (fileInput.current) fileInput.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.files)[0];
    if (file) {
      event.preventDefault();
      acceptFile(file);
    }
  };

  const canSubmit = !busy && (text.trim().length > 0 || image !== null);

  return (
    <div
      className={`card p-5 transition-colors ${dragging ? 'border-ink/40 bg-black/[0.02]' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      {image && !previewUrl ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] px-4 py-3">
          <span className="min-w-0 truncate text-sm">
            <span className="text-ink-faint">PDF</span> {image.name}
          </span>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-ink-soft hover:text-ink"
            onClick={clearImage}
            disabled={busy}
          >
            Remove
          </button>
        </div>
      ) : null}

      {previewUrl ? (
        <div className="relative mb-4 overflow-hidden rounded-xl border border-black/[0.06]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Uploaded screenshot" className="max-h-72 w-full object-contain" />
          <button
            type="button"
            className="absolute right-2 top-2 rounded-lg bg-white/90 px-2.5 py-1 text-xs text-ink-soft shadow-sm hover:text-ink"
            onClick={clearImage}
            disabled={busy}
          >
            Remove
          </button>
        </div>
      ) : image ? null : (
        <button
          type="button"
          className="mb-4 flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-black/15 py-8 text-sm text-ink-faint hover:border-ink/25 hover:text-ink-soft"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <span>Drag a screenshot or PDF here</span>
          <span className="text-xs">or tap to choose a file</span>
        </button>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={[...ALLOWED_IMAGE_TYPES, PDF_TYPE].join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) acceptFile(file);
        }}
      />

      <textarea
        className="field min-h-[96px] resize-y"
        placeholder="Paste text - e.g. 금요일 저녁 7시에 강남에서 저녁 먹자"
        value={text}
        maxLength={MAX_TEXT_LENGTH}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSubmit) {
            onAnalyze({ text: text.trim() || undefined, image: image ?? undefined });
          }
        }}
      />

      {localError ? <p className="mt-3 text-sm text-red-600">{localError}</p> : null}

      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={!canSubmit}
        onClick={() => onAnalyze({ text: text.trim() || undefined, image: image ?? undefined })}
      >
        {busy ? 'Analyzing...' : 'Analyze'}
      </button>
    </div>
  );
}
