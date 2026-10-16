'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type RefObject,
} from 'react';
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

/** The slice of the Web Speech API used here; TypeScript's DOM types do not ship it everywhere. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const speech = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

/** Recognition cannot detect the language, so Korean wins whenever the browser lists it at all. */
function dictationLanguage(): string {
  return navigator.languages?.find((lang) => lang.toLowerCase().startsWith('ko')) ?? navigator.language ?? 'ko-KR';
}

const MIC_BLOCKED = 'Microphone access is blocked. Allow it for CalDrop in your browser or app settings.';
const DICTATION_ERRORS: Record<string, string> = {
  'not-allowed': MIC_BLOCKED,
  'service-not-allowed': MIC_BLOCKED,
  'audio-capture': 'No microphone is available.',
  network: 'Voice input needs a connection. Check your network and try again.',
  'language-not-supported': 'Voice input does not support this language in your browser.',
};

/** Appends what was heard to what was already typed, separated by a space. */
function withSpoken(before: string, spoken: string): string {
  if (!spoken) return before;
  const gap = before && !/\s$/.test(before) ? ' ' : '';
  return (before + gap + spoken).slice(0, MAX_TEXT_LENGTH);
}

/**
 * Push-to-talk dictation into the text field, using the browser's own speech
 * recognition. Audio never reaches our server: only the words land in the
 * field, where they can be corrected before Analyze like anything typed.
 */
function useDictation(
  field: RefObject<HTMLTextAreaElement>,
  setText: (value: string) => void,
  onError: (message: string | null) => void,
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const holding = useRef(false);
  // The field as it was before the current recognition session, and what that session heard.
  const before = useRef('');
  const heard = useRef('');

  // Decided after mount: the server render cannot know, and guessing would
  // flash a button the browser cannot use.
  useEffect(() => {
    setSupported(recognitionConstructor() !== null);
  }, []);

  // Leaving the screen mid-dictation must release the microphone.
  useEffect(
    () => () => {
      holding.current = false;
      recognition.current?.abort();
    },
    [],
  );

  const listen = useCallback(
    function run() {
      const Recognition = recognitionConstructor();
      if (!Recognition) return;
      const next = new Recognition();
      next.lang = dictationLanguage();
      // One utterance per session: Android Chrome repeats text in continuous
      // mode, so a pause ends the session and a held button starts another.
      next.continuous = false;
      next.interimResults = true;
      heard.current = '';

      next.onresult = (event) => {
        heard.current = Array.from(event.results, (result) => result[0]?.transcript ?? '')
          .join('')
          .trim();
        setText(withSpoken(before.current, heard.current));
      };
      next.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        holding.current = false;
        onError(DICTATION_ERRORS[event.error] ?? 'Voice input stopped. Please try again.');
      };
      next.onend = () => {
        if (recognition.current !== next) return;
        if (holding.current) {
          before.current = withSpoken(before.current, heard.current);
          run();
          return;
        }
        recognition.current = null;
        setListening(false);
      };

      recognition.current = next;
      next.start();
    },
    [onError, setText],
  );

  const start = useCallback(() => {
    if (holding.current) return;
    onError(null);
    before.current = field.current?.value ?? '';
    holding.current = true;
    setListening(true);
    try {
      listen();
    } catch {
      holding.current = false;
      recognition.current = null;
      setListening(false);
      onError('Voice input could not start. Please try again.');
    }
  }, [field, listen, onError]);

  // stop() rather than abort(): the browser still delivers what it heard last.
  const stop = useCallback(() => {
    holding.current = false;
    recognition.current?.stop();
  }, []);

  return { supported, listening, start, stop };
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
  const textField = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(textField, setText, setLocalError);

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

  const canSubmit = !busy && !dictation.listening && (text.trim().length > 0 || image !== null);
  const submit = () => onAnalyze({ text: text.trim() || undefined, image: image ?? undefined });

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
        ref={textField}
        className="field min-h-[96px] resize-y"
        placeholder="Paste text - e.g. 금요일 저녁 7시에 강남에서 저녁 먹자"
        value={text}
        maxLength={MAX_TEXT_LENGTH}
        disabled={busy}
        readOnly={dictation.listening}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && canSubmit) submit();
        }}
      />

      {dictation.supported ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            // Held, not clicked: no text selection, callout menu or scrolling may steal the touch.
            className={`relative flex h-16 w-16 touch-none select-none items-center justify-center rounded-full text-white shadow-lg shadow-red-600/30 transition-transform duration-150 disabled:opacity-40 ${
              dictation.listening ? 'scale-110 bg-red-700' : 'bg-red-600 hover:bg-red-700'
            }`}
            disabled={busy}
            aria-label="Hold to talk"
            aria-pressed={dictation.listening}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              // Keeps the release on this button even if the finger drifts off it.
              event.currentTarget.setPointerCapture(event.pointerId);
              dictation.start();
            }}
            onPointerUp={dictation.stop}
            onPointerCancel={dictation.stop}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                event.preventDefault();
                dictation.start();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') dictation.stop();
            }}
            onBlur={dictation.stop}
          >
            {dictation.listening ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" aria-hidden />
            ) : null}
            <svg
              className="relative h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <path d="M12 17v4" />
            </svg>
          </button>
          <span className={`text-xs ${dictation.listening ? 'text-red-700' : 'text-ink-faint'}`} aria-live="polite">
            {dictation.listening ? 'Listening - release to finish' : 'Hold to talk'}
          </span>
        </div>
      ) : null}

      {localError ? <p className="mt-3 text-sm text-red-600">{localError}</p> : null}

      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={!canSubmit}
        onClick={submit}
      >
        {busy ? 'Analyzing...' : 'Analyze'}
      </button>
    </div>
  );
}
