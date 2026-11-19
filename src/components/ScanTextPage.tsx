import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react';
import type { Worker } from 'tesseract.js';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  Camera,
  CheckCircle2,
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
type OfflineAssetStatus = 'not-loaded' | 'loading' | 'ready' | 'unavailable';

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

// Module-level worker cache so language packs & WASM engines are reused across uploads
const cachedTesseractWorkers = new Map<OcrLanguageCode, Promise<Worker>>();
const loadedOfflinePacks = new Set<OcrLanguageCode>();

/**
 * Fast client-side image downscaling for Vision AI without slow grayscale pixel loops.
 * Preserves color and ink nuances needed for handwritten + printed English/Tamil OCR.
 */
async function prepareImagePayloadForVision(
  blob: File | Blob,
): Promise<{ base64: string; mimeType: string }> {
  const fallbackRead = async (b: Blob) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(b);
    });
    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    return {
      base64: dataUrl,
      mimeType: mimeMatch?.[1] || b.type || 'image/jpeg',
    };
  };

  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return fallbackRead(blob);
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const maxDim = Math.max(width, height);
    const scale = maxDim > 1600 ? 1600 / maxDim : 1;

    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return fallbackRead(blob);
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const outputMime = blob.type === 'image/png' && blob.size < 900_000 ? 'image/png' : 'image/jpeg';
    const quality = outputMime === 'image/jpeg' ? 0.9 : 1.0;
    const dataUrl = canvas.toDataURL(outputMime, quality);
    return { base64: dataUrl, mimeType: outputMime };
  } catch {
    return fallbackRead(blob);
  }
}

/**
 * Lightweight grayscale contrast prep used only when local Tesseract fallback runs.
 */
async function prepareImageForTesseract(blob: File | Blob): Promise<File | Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return blob;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const maxDim = Math.max(width, height);
    const scale =
      maxDim < 1200
        ? Math.min(2, 1400 / Math.max(1, maxDim))
        : maxDim > 2000
          ? 2000 / maxDim
          : 1;

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

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

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
    .replace(/\u200c/g, '')
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
  const [progress, setProgress] = useState<number | null>(null);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanMeta, setScanMeta] = useState<{
    engine: string;
    detectedLanguage?: string;
    writingStyle?: string;
  } | null>(null);
  const [uncertaintyWarning, setUncertaintyWarning] = useState<string | null>(null);
  const [offlineAssetStatus, setOfflineAssetStatus] =
    useState<OfflineAssetStatus>(
      loadedOfflinePacks.has('eng') ? 'ready' : 'not-loaded',
    );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // Optional live webcam capture
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setOfflineAssetStatus(
      loadedOfflinePacks.has(ocrLang) ? 'ready' : 'not-loaded',
    );
  }, [ocrLang]);

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
    setUncertaintyWarning(null);
    setScanMeta(null);
    setSavedFeedback(null);
    setStatusLabel('');
    setProgress(null);
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
      'image/jpeg',
      0.92,
    );
  };

  const getOrCreateTesseractWorker = async (
    lang: OcrLanguageCode,
    onLogger: (status: string, p?: number) => void,
  ): Promise<Worker> => {
    const existing = cachedTesseractWorkers.get(lang);
    if (existing) {
      return existing;
    }

    setOfflineAssetStatus('loading');
    const createPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const worker = await createWorker(lang, OEM.LSTM_ONLY, {
        langPath: '/tessdata',
        cacheMethod: 'write',
        logger: (msg) => {
          onLogger(
            msg.status ?? '',
            typeof msg.progress === 'number' ? msg.progress : undefined,
          );
        },
        errorHandler: () => {
          // Handled cleanly on rejection
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      loadedOfflinePacks.add(lang);
      setOfflineAssetStatus('ready');
      return worker;
    })();

    cachedTesseractWorkers.set(lang, createPromise);
    try {
      return await createPromise;
    } catch (err) {
      cachedTesseractWorkers.delete(lang);
      setOfflineAssetStatus('unavailable');
      throw err;
    }
  };

  const runLocalTesseractFallback = async (
    blob: File | Blob,
    reasonNotice?: string,
  ) => {
    const activeMeta =
      WORKING_OCR_LANGUAGES.find((l) => l.code === ocrLang) ??
      WORKING_OCR_LANGUAGES[0];

    setStatusLabel(
      loadedOfflinePacks.has(ocrLang)
        ? `Using cached local ${activeMeta.modelName} OCR engine…`
        : `Loading local ${activeMeta.modelName} offline pack (cached after first use)…`,
    );
    setProgress(null);

    const worker = await getOrCreateTesseractWorker(ocrLang, (msgStatus, p) => {
      if (msgStatus === 'recognizing text') {
        setStatusLabel(`Scanning printed ${activeMeta.label} text locally…`);
      } else if (msgStatus) {
        setStatusLabel(`Preparing ${activeMeta.modelName} (${msgStatus})…`);
      }
      if (typeof p === 'number') {
        setProgress(Math.round(p * 100));
      }
    });

    const preparedImage = await prepareImageForTesseract(blob);
    const result = await worker.recognize(preparedImage);
    const cleaned = cleanRecognizedText(result.data.text);

    if (!cleaned) {
      setError(
        `No readable printed ${activeMeta.label} text was found locally. Try a clearer image or ensure Vision AI is online for handwriting.`,
      );
      return;
    }

    setExtractedText(cleaned);
    setProgress(100);
    setStatusLabel('Local printed OCR complete');
    setScanMeta({
      engine: `Local Printed OCR (${activeMeta.modelName})`,
      detectedLanguage: activeMeta.label,
      writingStyle: 'Printed (Local fallback)',
    });
    if (reasonNotice) {
      setUncertaintyWarning(
        `${reasonNotice} Local browser OCR works best for printed text; review handwritten lines carefully before opening in Studio.`,
      );
    }
  };

  const runOcr = async () => {
    if (!selectedFile) {
      setError('Upload, paste, or capture an image first.');
      return;
    }

    setScanning(true);
    setError(null);
    setUncertaintyWarning(null);
    setScanMeta(null);
    setProgress(null);
    setStatusLabel('Preparing image and reading printed or handwritten text…');

    try {
      const payload = await prepareImagePayloadForVision(selectedFile);
      const controller = new AbortController();
      const abortTimer = window.setTimeout(() => controller.abort(), 45000);

      let visionResponse: Response;
      try {
        visionResponse = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64: payload.base64,
            mimeType: payload.mimeType,
            languageHint: ocrLang,
          }),
        });
      } finally {
        window.clearTimeout(abortTimer);
      }

      type VisionOcrResponse = {
        error?: string;
        message?: string;
        text?: string;
        detectedLanguage?: string;
        writingStyle?: string;
        uncertain?: boolean;
        uncertaintyNote?: string;
      };
      const raw = await visionResponse.text();
      let data: VisionOcrResponse | null = null;

      try {
        data = JSON.parse(raw) as VisionOcrResponse;
      } catch {
        data = null;
      }

      if (visionResponse.ok && data) {
        const cleaned = cleanRecognizedText(data.text ?? '');
        if (!cleaned) {
          setError(
            data.uncertaintyNote ||
              'No readable English or Tamil text was detected in this image. Try brighter lighting or a closer photo.',
          );
          setStatusLabel('');
          return;
        }

        setExtractedText(cleaned);
        setStatusLabel('Text extraction complete');
        setScanMeta({
          engine: 'Vision AI OCR',
          detectedLanguage: data.detectedLanguage,
          writingStyle: data.writingStyle,
        });
        if (data.uncertain || data.uncertaintyNote) {
          setUncertaintyWarning(
            data.uncertaintyNote ||
              'Some handwritten or low-contrast words may be uncertain. Please review and edit the text on the right if needed.',
          );
        }
        return;
      }

      // If Vision AI is unavailable or fails, automatically fall back to local printed OCR
      const fallbackMsg =
        data?.message ||
        `Vision AI OCR is temporarily unavailable (HTTP ${visionResponse.status}).`;
      await runLocalTesseractFallback(selectedFile, fallbackMsg);
    } catch (err) {
      // Network/timeout on Vision AI -> try cached local printed fallback
      try {
        await runLocalTesseractFallback(
          selectedFile,
          err instanceof Error && err.name === 'AbortError'
            ? 'Vision AI request timed out; used local printed OCR instead.'
            : 'Could not reach Vision AI; used local printed OCR instead.',
        );
      } catch (localErr) {
        const detail =
          localErr instanceof Error
            ? localErr.message
            : 'Could not extract text from this image.';
        setError(`OCR failed: ${detail}`);
      }
    } finally {
      setScanning(false);
    }
  };

  const resetAll = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setSelectedFile(null);
    setExtractedText('');
    setProgress(null);
    setStatusLabel('');
    setError(null);
    setUncertaintyWarning(null);
    setScanMeta(null);
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
            Scan Text (Printed &amp; Handwritten OCR)
          </h1>
          <p className={`mt-1 text-sm sm:text-base ${tokens.subtext}`}>
            Upload a photo, screenshot, or handwritten note, paste from
            clipboard (Ctrl+V), or use your camera. Automatically detects
            printed and handwritten English, Tamil, or mixed pages.
          </p>
        </div>

        {/* Compact Language Hint Selector + Offline Cache Readiness */}
        <div className="space-y-2 shrink-0">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className={`text-xs font-semibold ${tokens.subtext}`}>
                Document hint (auto-detects script)
              </span>
              <span className={`text-[11px] font-medium ${tokens.subtext}`}>
                Offline pack:{' '}
                <strong className={tokens.text}>
                  {offlineAssetStatus === 'ready'
                    ? 'Ready'
                    : offlineAssetStatus === 'loading'
                      ? 'Loading…'
                      : offlineAssetStatus === 'unavailable'
                        ? 'Unavailable'
                        : 'On demand'}
                </strong>
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="OCR document language hint"
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
                Drop a printed or handwritten image here, upload, or paste
              </p>
              <p className={`text-xs ${tokens.subtext}`}>
                Supports English, தமிழ் (Tamil), and mixed Tamil + English pages.
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
                    {progress !== null ? `Scanning (${progress}%)…` : 'Reading image…'}
                  </>
                ) : (
                  'Extract text from image'
                )}
              </button>
            </div>
          )}

          {scanning && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="flex justify-between text-xs tabular-nums">
                <span className={tokens.subtext}>{statusLabel}</span>
                {progress !== null && (
                  <span className={tokens.subtext}>{progress}%</span>
                )}
              </div>
              {progress !== null && (
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
              )}
            </div>
          )}

          {scanMeta && !scanning && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs flex flex-wrap items-center gap-2 ${tokens.cardBg} ${tokens.border}`}
            >
              <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
              <span className={`font-semibold ${tokens.text}`}>{scanMeta.engine}</span>
              {scanMeta.detectedLanguage && (
                <span className={tokens.subtext}>· {scanMeta.detectedLanguage}</span>
              )}
              {scanMeta.writingStyle && (
                <span className={tokens.subtext}>· {scanMeta.writingStyle}</span>
              )}
            </div>
          )}

          {uncertaintyWarning && (
            <div
              role="status"
              className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-xs font-medium flex items-start gap-2.5"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <span className={tokens.text}>{uncertaintyWarning}</span>
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
              placeholder="Extracted printed or handwritten text (English & தமிழ்) will appear here. You can edit any words before sending to Reading Studio."
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
