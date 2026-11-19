import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  BookmarkCheck,
  Check,
  Copy,
  Eraser,
  Languages,
  Loader2,
  Square,
  Volume2,
} from 'lucide-react';
import type { SpeechController } from '@/hooks/useSpeech';
import {
  getLanguageMeta,
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from '@/lib/languages';
import type { ThemeStyleTokens } from '@/settings';

interface TamilTranslatorProps {
  workspaceText: string;
  aiConfigured: boolean | null;
  speech: SpeechController;
  tokens: ThemeStyleTokens;
  onOpenInStudio: (text: string) => void;
  onSaveToLibrary: (text: string) => void;
}

export function TamilTranslator({
  workspaceText,
  aiConfigured,
  speech,
  tokens,
  onOpenInStudio,
  onSaveToLibrary,
}: TamilTranslatorProps) {
  const [sourceLang, setSourceLang] = useState<SupportedLanguageCode>('en');
  const targetLang: SupportedLanguageCode = sourceLang === 'en' ? 'ta' : 'en';

  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [provider, setProvider] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const translateReqIdRef = useRef(0);

  const sourceMeta = getLanguageMeta(sourceLang);
  const targetMeta = getLanguageMeta(targetLang);

  const handleSourceChange = (next: SupportedLanguageCode) => {
    setSourceLang(next);
    setError(null);
    setProvider(null);
  };

  const handleTargetChange = (next: SupportedLanguageCode) => {
    setSourceLang(next === 'ta' ? 'en' : 'ta');
    setError(null);
    setProvider(null);
  };

  const handleSwap = () => {
    setSourceLang((prev) => (prev === 'en' ? 'ta' : 'en'));
    if (outputText.trim()) {
      setInputText(outputText);
      setOutputText('');
    }
    setError(null);
    setProvider(null);
    setCopied(false);
    setCopyError(null);
  };

  const handleClear = () => {
    translateReqIdRef.current += 1;
    setTranslating(false);
    setInputText('');
    setOutputText('');
    setProvider(null);
    setError(null);
    setCopied(false);
    setCopyError(null);
  };

  const handleTranslate = async () => {
    const trimmed = inputText.trim();
    setError(null);
    setCopied(false);
    setCopyError(null);

    if (!trimmed) {
      setError('Enter English or Tamil text to translate.');
      return;
    }

    const reqId = ++translateReqIdRef.current;
    setTranslating(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: inputText,
          sourceLang,
          targetLang,
        }),
      });
      if (reqId !== translateReqIdRef.current) return;

      const raw = await res.text();
      interface TranslateApiResponse {
        translatedText?: string;
        provider?: string;
        message?: string;
        error?: string;
      }
      let data: TranslateApiResponse | null = null;
      try {
        data = JSON.parse(raw) as TranslateApiResponse;
      } catch {
        data = null;
      }
      if (reqId !== translateReqIdRef.current) return;

      if (!res.ok || !data?.translatedText) {
        setOutputText('');
        setProvider(null);
        setError(
          data?.message ||
            'Translation service is unavailable. Verify internet connectivity or configure GEMINI_API_KEY on the server.',
        );
      } else {
        setOutputText(data.translatedText);
        setProvider(data.provider ?? null);
      }
    } catch (err) {
      if (reqId !== translateReqIdRef.current) return;
      setOutputText('');
      setProvider(null);
      setError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Translation request timed out. Try a shorter passage or retry.'
          : 'Could not reach the translation server endpoint (/api/translate). Check your connection or configure GEMINI_API_KEY in Settings > Secrets.',
      );
    } finally {
      window.clearTimeout(timer);
      if (reqId === translateReqIdRef.current) {
        setTranslating(false);
      }
    }
  };

  const handleCopy = async () => {
    if (!outputText.trim()) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Clipboard access was blocked by the browser.');
    }
  };

  const canPullWorkspace =
    workspaceText.trim().length > 0 && workspaceText.trim() !== inputText.trim();

  return (
    <section
      aria-label="English to Tamil and Tamil to English translator"
      className={`rounded-3xl border p-5 sm:p-6 space-y-4 ${tokens.panelBg} ${tokens.border}`}
    >
      {/* Top Bar: Two languages only + Swap + Translate + Clear */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
              From
            </span>
            <select
              value={sourceLang}
              onChange={(e) =>
                handleSourceChange(e.target.value as SupportedLanguageCode)
              }
              aria-label="Source language"
              className={`rounded-xl border px-3 py-2 text-sm font-medium min-h-[40px] font-indic ${tokens.input}`}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.nativeName})
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleSwap}
            title="Swap English and Tamil"
            aria-label="Swap languages"
            className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 min-h-[40px] text-sm font-semibold transition-colors ${tokens.secondaryBtn}`}
          >
            <ArrowLeftRight className="h-4 w-4 text-teal-600" aria-hidden />
          </button>

          <label className="block">
            <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
              To
            </span>
            <select
              value={targetLang}
              onChange={(e) =>
                handleTargetChange(e.target.value as SupportedLanguageCode)
              }
              aria-label="Target language"
              className={`rounded-xl border px-3 py-2 text-sm font-medium min-h-[40px] font-indic ${tokens.input}`}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.nativeName})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPullWorkspace && (
            <button
              type="button"
              onClick={() => {
                setInputText(workspaceText);
                setError(null);
              }}
              className={`rounded-xl border px-3 py-2 min-h-[40px] text-xs font-semibold ${tokens.secondaryBtn}`}
            >
              Use workspace text
            </button>
          )}
          <button
            type="button"
            onClick={handleClear}
            disabled={!inputText && !outputText && !error}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 min-h-[40px] text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed ${tokens.secondaryBtn}`}
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
          <button
            type="button"
            onClick={handleTranslate}
            disabled={translating || !inputText.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 min-h-[40px] text-sm font-bold text-white hover:bg-teal-500 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {translating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Languages className="h-4 w-4" aria-hidden />
            )}
            {translating ? 'Translating…' : 'Translate'}
          </button>
        </div>
      </div>

      {/* Compact Two-Box Layout: Input & Output */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label
              htmlFor="translator-input"
              className={`font-bold ${tokens.text}`}
            >
              {sourceMeta.label} ({sourceMeta.nativeName})
            </label>
            <span className={`tabular-nums ${tokens.subtext}`}>
              {inputText.length} / 8000
            </span>
          </div>
          <textarea
            id="translator-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={8000}
            rows={7}
            placeholder={
              sourceLang === 'en'
                ? 'Type or paste English text to translate into Tamil…'
                : 'தமிழ் உரையை இங்கே உள்ளிடவும்…'
            }
            className={`w-full resize-y rounded-2xl border px-4 py-3 text-base leading-relaxed font-indic focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${tokens.input}`}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label
              htmlFor="translator-output"
              className={`font-bold ${tokens.text}`}
            >
              {targetMeta.label} ({targetMeta.nativeName})
              {provider ? (
                <span className={`font-normal ml-1.5 ${tokens.subtext}`}>
                  · via {provider}
                </span>
              ) : null}
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!outputText.trim()}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed ${tokens.secondaryBtn}`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Copy
                  </>
                )}
              </button>

              {speech.supported && (
                <button
                  type="button"
                  onClick={() =>
                    speech.speaking && speech.activeSpeechMode === 'translation'
                      ? speech.stop()
                      : speech.speakText(outputText, targetLang)
                  }
                  disabled={!outputText.trim()}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed ${tokens.secondaryBtn}`}
                >
                  {speech.speaking && speech.activeSpeechMode === 'translation' ? (
                    <>
                      <Square className="h-3 w-3 text-coral-600" aria-hidden />
                      Stop
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                      Listen
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <textarea
            id="translator-output"
            readOnly
            value={outputText}
            rows={7}
            placeholder={
              translating
                ? 'Translating…'
                : targetLang === 'ta'
                  ? 'தமிழ் மொழிபெயர்ப்பு இங்கே தோன்றும்…'
                  : 'English translation will appear here…'
            }
            aria-label="Translated text output"
            className={`w-full resize-y rounded-2xl border px-4 py-3 text-base leading-relaxed font-indic focus:border-teal-500 focus:outline-none ${tokens.input}`}
          />
        </div>
      </div>

      {/* Action Links for Translated Output */}
      {outputText.trim() && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onSaveToLibrary(outputText)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold ${tokens.secondaryBtn}`}
          >
            <BookmarkCheck className="h-3.5 w-3.5 text-teal-600" aria-hidden />
            Save to Library
          </button>
          <button
            type="button"
            onClick={() => onOpenInStudio(outputText)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500"
          >
            Open in Reading Studio
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* Status, Error, Speech & Setup Notices */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-coral-500/40 bg-coral-500/10 px-4 py-3 text-sm font-medium text-coral-600 flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {copyError && (
        <p role="status" className="text-xs font-medium text-coral-600">
          {copyError}
        </p>
      )}

      {speech.voiceWarning && (
        <div
          role="alert"
          className="rounded-xl border border-coral-500/40 bg-coral-500/10 px-4 py-2.5 text-xs font-medium text-coral-600 flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{speech.voiceWarning}</span>
        </div>
      )}

      {aiConfigured === false && (
        <p className={`text-xs ${tokens.subtext}`}>
          Note: <code>GEMINI_API_KEY</code> is not set on the server, so live{' '}
          <code>English ↔ Tamil</code> translation uses MyMemory. Add{' '}
          <code>GEMINI_API_KEY</code> in Settings &gt; Secrets for Gemini AI
          translation.
        </p>
      )}
    </section>
  );
}
