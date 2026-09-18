'use client';

import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_TEXT_LENGTH } from '@/lib/util/upload-constants';

interface InputCardProps {
  busy: boolean;
  onAnalyze: (input: { text?: string; image?: File }) => void;
  /** Pre-filled content, e.g. a screenshot shared in from the Android share sheet. */
  initial?: { text?: string; image?: File } | null;
}

function isAllowed(file: File): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type);
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
    if (!isAllowed(file)) {
      setLocalError('Only PNG, JPEG, WebP or GIF screenshots are supported.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setLocalError(`Screenshots must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller.`);
      return;
    }
    setLocalError(null);
    setImage(file);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
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
      ) : (
        <button
          type="button"
          className="mb-4 flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-black/15 py-8 text-sm text-ink-faint hover:border-ink/25 hover:text-ink-soft"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <span>Drag a screenshot here</span>
          <span className="text-xs">or tap to choose from your photos</span>
        </button>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
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
