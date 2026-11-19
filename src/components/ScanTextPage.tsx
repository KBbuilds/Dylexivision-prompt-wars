import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react';
import { createWorker, OEM, PSM } from 'tesseract.js';
import {
  ArrowRight,
  BookmarkCheck,
  Camera,
  FileImage,
  Loader2,
  RotateCcw,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { ThemeStyleTokens } from '@/settings';

interface ScanTextPageProps {
  onSendToStudio: (extractedText: string, source?: 'ocr') => void;
  onSaveToLibrary: (extractedText: string, title?: string) => void;
  tokens: ThemeStyleTokens;
}

type OcrLanguageCode = 'eng' | 'tam' | 'tam+eng';

const WORKING_OCR_LANGUAGES: Array<{
  code: OcrLanguageCode;
  label: string;
  modelName: string;
}> = [
  { code: 'eng', label: 'English', modelName: 'English (eng)' },
  { code: 'tam', label: 'தமிழ் (Tamil)', modelName: 'Tamil (tam)' },
  {
    code: 'tam+eng',
    label: 'Tamil + English',
    modelName: 'Tamil + English (tam+eng)',
  },
];

const UPCOMING_OCR_LANGUAGES = [
  'Hindi',
  'Malayalam',
  'Kannada',
  'Telugu',
] as const;

/**
 * Gently upscale small screenshots and normalize contrast into crisp grayscale
 * so thin Tamil vowel hooks and pulli dots remain sharp for Tesseract LSTM.
 */
async function prepareImageForOcr(blob: File | Blob): Promise<File | Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return blob;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const maxDim = Math.max(width, height);
    const scale = maxDim < 1400 ? Math.min(2, 1600 / Math.max(1, maxDim)) : maxDim > 2400 ? 2400 / maxDim : 1;

    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return blob;
    }

    // White background prevents transparent PNGs from turning black during JPEG/OCR
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    // Subtle grayscale contrast stretch preserving antialiased edges
    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imageData.data;
    let minLum = 255;
    let maxLum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
      );
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
    }

    const range = maxLum - minLum;
    if (range > 25 && range < 210) {
      for (let i = 0; i < data.length; i += 4) {
        const stretched = Math.min(
          255,
          Math.max(0, Math.round(((data[i] - minLum) / range) * 255)),
        );
        data[i] = stretched;
        data[i + 1] = stretched;
        data[i + 2] = stretched;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const processed = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png', 1.0),
    );
    return processed ?? blob;
  } catch {
    return blob;
  }
}

function cleanRecognizedText(raw: string): string {
  return raw
    .replace(/\u200c/g, '') // remove stray ZWNJ artifacts emitted by Tesseract tam
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ScanTextPage({
  onSendToStudio,
  onSaveToLibrary,
  tokens,
}: ScanTextPageProps) {
  const [ocrLang, setOcrLang] = useState<OcrLanguageCode>('eng');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | Blob | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatchHint, setMismatchHint] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // Optional live webcam capture
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [imagePreviewUrl]);

  const loadImageBlob = (blob: File | Blob) => {
    setError(null);
    setMismatchHint(null);
    setSavedFeedback(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    const nextUrl = URL.createObjectURL(blob);
    setImagePreviewUrl(nextUrl);
    setSelectedFile(blob);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP, etc.).');
      return;
    }
    loadImageBlob(file);
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          loadImageBlob(blob);
          break;
        }
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      cameraInputRef.current?.click();
    }
  };

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          loadImageBlob(blob);
          stopCamera();
        }
      },
      'image/png',
      0.95,
    );
  };

  const runOcr = async () => {
    if (!selectedFile) {
      setError('Upload, paste, or capture an image first.');
      return;
    }

    const activeMeta =
      WORKING_OCR_LANGUAGES.find((l) => l.code === ocrLang) ??
      WORKING_OCR_LANGUAGES[0];

    setScanning(true);
    setError(null);
    setMismatchHint(null);
    setProgress(5);
    setStatusLabel(`Loading ${activeMeta.modelName} OCR model…`);

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    let workerInitError: string | null = null;
    let timeoutId: number | null = null;
    let rejectOnWorkerError: ((reason: Error) => void) | null = null;

    try {
      const workerErrorPromise = new Promise<never>((_, reject) => {
        rejectOnWorkerError = reject;
      });

      const workerPromise = createWorker(ocrLang, OEM.LSTM_ONLY, {
        logger: (msg) => {
          if (msg.status) {
            if (msg.status === 'recognizing text') {
              setStatusLabel(`Recognizing ${activeMeta.label} text…`);
            } else if (msg.status.includes('loading language')) {
              setStatusLabel(`Downloading ${activeMeta.modelName} traineddata…`);
            } else {
              setStatusLabel(`Preparing ${activeMeta.label} OCR (${msg.status})…`);
            }
          }
          if (typeof msg.progress === 'number') {
            setProgress(Math.max(5, Math.round(msg.progress * 100)));
          }
        },
        errorHandler: (err) => {
          const message =
            err instanceof Error ? err.message : String(err ?? 'Worker error');
          workerInitError = message;
          rejectOnWorkerError?.(new Error(message));
        },
      });
      void workerPromise.catch(() => {});

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () =>
            reject(
              new Error(
                `Timed out while loading the ${activeMeta.modelName} model.`,
              ),
            ),
          35000,
        );
      });

      worker = await Promise.race([
        workerPromise,
        workerErrorPromise,
        timeoutPromise,
      ]);

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (workerInitError) {
        throw new Error(workerInitError);
      }

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });

      const preparedImage = await prepareImageForOcr(selectedFile);
      const result = await worker.recognize(preparedImage);

      if (workerInitError) {
        throw new Error(workerInitError);
      }

      const cleaned = cleanRecognizedText(result.data.text);

      if (!cleaned) {
        setError(
          `No readable ${activeMeta.label} text was detected in this image. Try a clearer, brighter photo with straight horizontal text.`,
        );
      } else {
        setExtractedText(cleaned);
        setProgress(100);
        setStatusLabel(`${activeMeta.label} extraction complete`);

        if (ocrLang === 'eng') {
          const lettersOnly = cleaned.replace(/[^A-Za-z]/g, '').length;
          if (cleaned.length > 8 && lettersOnly / cleaned.length < 0.35) {
            setMismatchHint(
              'The extracted text looks unusual for English. If this image has Tamil script, switch OCR language to தமிழ் (Tamil) or Tamil + English above and scan again.',
            );
          }
        }
      }
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : workerInitError || 'Could not extract text from the selected image.';
      if (ocrLang.includes('tam')) {
        setError(
          `Tamil OCR failed (${detail}). English fallback was not used. Check your network connection so the Tamil model (tam) can download, or try a sharper image.`,
        );
      } else {
        setError(`OCR failed: ${detail}`);
      }
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // ignore cleanup failure
        }
      }
      setScanning(false);
    }
  };

  const resetAll = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setSelectedFile(null);
    setExtractedText('');
    setProgress(0);
    setStatusLabel('');
    setError(null);
    setMismatchHint(null);
    setSavedFeedback(null);
    stopCamera();
  };

  return (
    <div
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6"
      onPaste={handlePaste}
    >
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className={`font-display text-2xl sm:text-3xl font-bold ${tokens.text}`}>
            Scan Text (Client-Side OCR)
          </h1>
          <p className={`mt-1 text-sm sm:text-base ${tokens.subtext}`}>
            Upload a screenshot, photograph a page, paste from clipboard
            (Ctrl+V), or use your camera. Runs privately in your browser with
            Tesseract.js.
          </p>
        </div>

        {/* Compact Language Selector + Disabled Upcoming Languages */}
        <div className="space-y-2 shrink-0">
          <div>
            <span className={`block text-xs font-semibold mb-1.5 ${tokens.subtext}`}>
              OCR language
            </span>
            <div
              role="radiogroup"
              aria-label="OCR document language"
              className={`inline-flex flex-wrap gap-1 rounded-xl border p-1 ${tokens.panelBg} ${tokens.border}`}
            >
              {WORKING_OCR_LANGUAGES.map((lang) => {
                const selected = ocrLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={scanning}
                    onClick={() => {
                      setOcrLang(lang.code);
                      setError(null);
                      setMismatchHint(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-colors whitespace-nowrap font-indic disabled:opacity-50 ${
                      selected
                        ? 'bg-teal-600 text-white'
                        : tokens.dark
                          ? 'text-[#D6E1F0] hover:bg-[#1A2D49]'
                          : 'text-navy-800 hover:bg-cream-100'
                    }`}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            aria-label="Upcoming OCR languages"
            className="flex flex-wrap items-center gap-1.5 text-[11px]"
          >
            <span className={`font-semibold ${tokens.subtext}`}>
              Coming Soon:
            </span>
            {UPCOMING_OCR_LANGUAGES.map((langName) => (
              <span
                key={langName}
                aria-disabled="true"
                title={`${langName} OCR is coming soon`}
                className={`rounded-md border px-2 py-0.5 opacity-60 cursor-not-allowed select-none ${tokens.border} ${tokens.subtext}`}
              >
                {langName}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Image input & preview */}
        <section
          aria-label="Image upload and camera capture"
          className={`rounded-3xl border p-5 sm:p-6 space-y-4 ${tokens.panelBg} ${tokens.border}`}
        >
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 min-h-[44px] text-sm font-semibold ${tokens.secondaryBtn}`}
            >
              <Upload className="h-4 w-4 text-teal-600" aria-hidden />
              Upload image
            </button>

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 min-h-[44px] text-sm font-semibold ${tokens.secondaryBtn}`}
            >
              <Camera className="h-4 w-4 text-teal-600" aria-hidden />
              Photo / Mobile Camera
            </button>

            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 min-h-[44px] text-sm font-semibold ${tokens.secondaryBtn}`}
            >
              <Video className="h-4 w-4 text-teal-600" aria-hidden />
              {cameraActive ? 'Close webcam' : 'Live webcam'}
            </button>

            {(imagePreviewUrl || extractedText) && (
              <button
                type="button"
                onClick={resetAll}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 min-h-[44px] text-sm font-semibold ${tokens.secondaryBtn}`}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reset
              </button>
            )}
          </div>

          {cameraActive && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border border-teal-500 bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full max-h-72 object-contain"
                />
                <button
                  type="button"
                  onClick={stopCamera}
                  aria-label="Close camera preview"
                  className="absolute top-2 right-2 rounded-full bg-navy-900/80 p-2 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={captureFromCamera}
                className="w-full rounded-xl bg-teal-600 px-4 py-3 min-h-[44px] text-sm font-bold text-white hover:bg-teal-500"
              >
                Capture page photo
              </button>
            </div>
          )}

          {!cameraActive && !imagePreviewUrl && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  loadImageBlob(file);
                }
              }}
              className={`rounded-2xl border-2 border-dashed p-8 text-center space-y-2 ${tokens.border}`}
            >
              <FileImage
                className={`mx-auto h-10 w-10 ${tokens.subtext}`}
                aria-hidden
              />
              <p className={`text-sm font-semibold ${tokens.text}`}>
                Drop an image here, upload a file, or paste a screenshot
              </p>
              <p className={`text-xs ${tokens.subtext}`}>
                Works best with clear lighting and horizontal text lines.
              </p>
            </div>
          )}

          {imagePreviewUrl && !cameraActive && (
            <div className="space-y-3">
              <img
                src={imagePreviewUrl}
                alt="Selected page preview for OCR"
                className={`w-full max-h-80 object-contain rounded-2xl border ${tokens.border} bg-black/5`}
              />
              <button
                type="button"
                onClick={runOcr}
                disabled={scanning}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3.5 min-h-[48px] text-base font-bold text-white hover:bg-teal-500 disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Scanning ({progress}%)…
                  </>
                ) : (
                  `Extract ${WORKING_OCR_LANGUAGES.find((l) => l.code === ocrLang)?.label ?? ''} text`
                )}
              </button>
            </div>
          )}

          {scanning && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="flex justify-between text-xs tabular-nums">
                <span className={tokens.subtext}>{statusLabel}</span>
                <span className={tokens.subtext}>{progress}%</span>
              </div>
              <div
                className={`h-2 rounded-full overflow-hidden ${tokens.dark ? 'bg-[#0F1B2E]' : 'bg-cream-200'}`}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-teal-600 transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-coral-500/40 bg-coral-500/10 px-4 py-3 text-sm font-medium text-coral-600"
            >
              {error}
            </div>
          )}

          {mismatchHint && !error && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-3 text-xs font-medium ${tokens.border} ${tokens.subtext}`}
            >
              {mismatchHint}
            </div>
          )}
        </section>

        {/* Right: Editable extracted text & send to studio */}
        <section
          aria-label="Extracted text editor"
          className={`rounded-3xl border p-5 sm:p-6 flex flex-col justify-between gap-4 ${tokens.panelBg} ${tokens.border}`}
        >
          <div className="space-y-3 flex-1 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <h2 className={`text-lg font-bold ${tokens.text}`}>
                Extracted text (editable)
              </h2>
              {extractedText.trim() && (
                <span className={`text-xs tabular-nums ${tokens.subtext}`}>
                  {extractedText.trim().split(/\s+/).length} words
                </span>
              )}
            </div>

            <textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              placeholder="Extracted text will appear here after scanning. Select தமிழ் (Tamil) above before scanning Tamil pages."
              rows={12}
              aria-label="Editable OCR extracted text"
              className={`w-full flex-1 resize-y rounded-2xl border px-4 py-3.5 text-base leading-relaxed font-indic focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${tokens.input}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onSendToStudio(extractedText, 'ocr')}
                disabled={!extractedText.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3.5 min-h-[48px] text-base font-bold text-white hover:bg-teal-500 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                Open in Reading Studio
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveToLibrary(extractedText);
                  setSavedFeedback('Saved scanned passage to My Library.');
                }}
                disabled={!extractedText.trim()}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 min-h-[48px] text-sm font-semibold disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${tokens.secondaryBtn}`}
              >
                <BookmarkCheck className="h-4 w-4 text-teal-600" aria-hidden />
                Save to Library
              </button>
            </div>
            {savedFeedback && (
              <p
                role="status"
                className={`text-sm font-medium ${tokens.dark ? 'text-teal-300' : 'text-teal-700'}`}
              >
                {savedFeedback}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
