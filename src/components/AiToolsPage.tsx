import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  Check,
  CheckCircle2,
  Copy,
  Languages,
  Loader2,
  Sparkles,
  Volume2,
  Wand2,
} from 'lucide-react';
import { TamilTranslator } from '@/components/TamilTranslator';
import type { SpeechController } from '@/hooks/useSpeech';
import { containsTamilScript } from '@/lib/languages';
import {
  chunkParagraphsOffline,
  detectDifficultWords,
  detectLongTamilWords,
  easierEnglishOffline,
  extractFallbackWord,
  extractKeyPointsOffline,
  generateOfflineRecallPractice,
  simplifyTextOffline,
  summarizeOffline,
  type RecallItem,
} from '@/lib/textProcessing';
import type { ThemeStyleTokens } from '@/settings';

interface AiToolsPageProps {
  text: string;
  onTextChange: (text: string) => void;
  onOpenInStudio: (newText?: string, source?: 'ai' | 'translated') => void;
  onSaveToLibrary: (content: string, source?: 'ai' | 'translated') => void;
  speech: SpeechController;
  tokens: ThemeStyleTokens;
}

type ToolId =
  | 'simplify'
  | 'easier-english'
  | 'explain-words'
  | 'synonyms'
  | 'summarize'
  | 'key-points'
  | 'paragraph-chunking'
  | 'comprehension';

interface DictionaryResult {
  word: string;
  phonetic: string;
  meanings: Array<{
    partOfSpeech: string;
    definition: string;
    example?: string;
  }>;
  synonyms: string[];
  provider: string;
}

interface AiQuestion {
  question: string;
  answer: string;
  hint: string;
}

interface AiWordItem {
  word: string;
  simpleMeaning: string;
  synonyms: string[];
}

const TOOL_LIST: Array<{ id: ToolId; label: string; offlineSupport: string }> = [
  { id: 'simplify', label: 'Simplify Text', offlineSupport: 'Offline + AI' },
  {
    id: 'easier-english',
    label: 'Easier English / Easy Tamil',
    offlineSupport: 'AI / Rule-based',
  },
  {
    id: 'explain-words',
    label: 'Explain Words',
    offlineSupport: 'Free Dictionary + AI',
  },
  {
    id: 'synonyms',
    label: 'Synonyms',
    offlineSupport: 'Free Thesaurus + AI',
  },
  { id: 'summarize', label: 'Summarize', offlineSupport: 'Offline + AI' },
  { id: 'key-points', label: 'Key Points', offlineSupport: 'Offline + AI' },
  {
    id: 'paragraph-chunking',
    label: 'Paragraph Chunking',
    offlineSupport: 'Offline + AI',
  },
  {
    id: 'comprehension',
    label: 'Comprehension',
    offlineSupport: 'AI / Recall Check',
  },
];

export function AiToolsPage({
  text,
  onTextChange,
  onOpenInStudio,
  onSaveToLibrary,
  speech,
  tokens,
}: AiToolsPageProps) {
  const [activeTab, setActiveTab] = useState<'tools' | 'translate'>('tools');
  const [selectedTool, setSelectedTool] = useState<ToolId>('simplify');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // Tool output state
  const [loadingTool, setLoadingTool] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiNoticeShowOfflineBtn, setAiNoticeShowOfflineBtn] = useState(false);
  const [resultText, setResultText] = useState('');
  const [resultSource, setResultSource] = useState<string>('');
  const [resultKind, setResultKind] = useState<'ai' | 'offline' | null>(null);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [wordChanges, setWordChanges] = useState<
    Array<{ original: string; simpler: string }>
  >([]);
  const [aiWords, setAiWords] = useState<AiWordItem[]>([]);
  const [aiQuestions, setAiQuestions] = useState<AiQuestion[]>([]);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>(
    {},
  );
  const [offlineRecall, setOfflineRecall] = useState<RecallItem[]>([]);

  // Dictionary / Synonym lookup state
  const [wordInput, setWordInput] = useState('');
  const [dictLoading, setDictLoading] = useState(false);
  const [dictResult, setDictResult] = useState<DictionaryResult | null>(null);
  const [dictSource, setDictSource] = useState<string>('');
  const [dictError, setDictError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const aiRequestIdRef = useRef(0);
  const dictRequestIdRef = useRef(0);

  const difficultWords = useMemo(() => detectDifficultWords(text), [text]);
  const longTamilWords = useMemo(() => detectLongTamilWords(text), [text]);

  const handleCopy = async (content: string, id: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(content);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    }
  };

  useEffect(() => {
    let active = true;
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then((data: { aiConfigured?: boolean }) => {
        if (active) setAiConfigured(Boolean(data.aiConfigured));
      })
      .catch(() => {
        if (active) setAiConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const clearOutputs = (clearDictionary = false) => {
    aiRequestIdRef.current += 1;
    setLoadingTool(false);
    setToolError(null);
    setAiNotice(null);
    setAiNoticeShowOfflineBtn(false);
    setResultText('');
    setResultSource('');
    setResultKind(null);
    setKeyPoints([]);
    setWordChanges([]);
    setAiWords([]);
    setAiQuestions([]);
    setRevealedAnswers({});
    setOfflineRecall([]);
    setCopiedId(null);
    if (clearDictionary) {
      dictRequestIdRef.current += 1;
      setDictLoading(false);
      setDictResult(null);
      setDictSource('');
      setDictError(null);
    }
  };

  const lookupDictionaryWord = async (wordToFind: string) => {
    const clean = wordToFind.trim();
    if (!clean) return;
    const reqId = ++dictRequestIdRef.current;
    setWordInput(clean);
    setDictLoading(true);
    setDictError(null);
    setDictResult(null);
    setDictSource('');

    try {
      const res = await fetch(
        `/api/dictionary?word=${encodeURIComponent(clean)}`,
      );
      if (reqId !== dictRequestIdRef.current) return;
      const raw = await res.text();
      let data: (DictionaryResult & { message?: string }) | null = null;
      try {
        data = JSON.parse(raw) as DictionaryResult & { message?: string };
      } catch {
        data = null;
      }
      if (reqId !== dictRequestIdRef.current) return;
      if (!res.ok || !data) {
        setDictError(
          data?.message || `No dictionary or synonym entry found for "${clean}".`,
        );
      } else {
        setDictResult(data);
        setDictSource('Free Dictionary & Thesaurus (dictionaryapi.dev / Datamuse)');
      }
    } catch {
      if (reqId !== dictRequestIdRef.current) return;
      setDictError(
        'Could not reach the free online dictionary service right now (requires internet connectivity).',
      );
    } finally {
      if (reqId === dictRequestIdRef.current) {
        setDictLoading(false);
      }
    }
  };

  const lookupWordOrTamil = async (wordToFind: string) => {
    const clean = wordToFind.trim();
    if (!clean) return;
    if (containsTamilScript(clean)) {
      setWordInput(clean);
      await runAiTool(selectedTool === 'synonyms' ? 'synonyms' : 'explain-words', clean);
      return;
    }
    await lookupDictionaryWord(clean);
  };

  const runOfflineTool = (tool: ToolId) => {
    const isWordTool = tool === 'explain-words' || tool === 'synonyms';
    clearOutputs(!isWordTool);
    if (!text.trim() && !(isWordTool && wordInput.trim())) {
      setToolError('Paste or load a passage first.');
      return;
    }

    switch (tool) {
      case 'simplify': {
        const { simplified, changes, changed } = simplifyTextOffline(text);
        if (!changed) {
          setAiNoticeShowOfflineBtn(false);
          setAiNotice(
            'Offline rules did not find formal substitutions or long compound sentences to shorten in this passage. Use Gemini AI for deeper rewriting.',
          );
          return;
        }
        setResultText(simplified);
        setWordChanges(changes);
        setResultKind('offline');
        setResultSource('Offline Rule-Based Simplifier');
        break;
      }
      case 'easier-english': {
        const { simplified, changes, changed } = easierEnglishOffline(text);
        if (!changed) {
          setAiNoticeShowOfflineBtn(false);
          setAiNotice(
            containsTamilScript(text)
              ? 'ஆஃப்லைன் விதிகள் மாற்ற வேண்டிய கடினச் சொற்களைக் கண்டறியவில்லை. முழு எளிய தமிழ் (Easy Tamil) மாற்றத்திற்கு Gemini AI-ஐப் பயன்படுத்தவும்.'
              : 'Offline rules did not find formal phrases or long sentences to rewrite. Use Gemini AI for full plain-language rewriting.',
          );
          return;
        }
        setResultText(simplified);
        setWordChanges(changes);
        setResultKind('offline');
        setResultSource(
          containsTamilScript(text)
            ? 'Offline Rule-Based Easy Tamil Helper (for full AI rewriting, use Gemini AI)'
            : 'Offline Rule-Based Plain-English Helper (for full AI rewriting, use Gemini AI)',
        );
        break;
      }
      case 'paragraph-chunking': {
        const chunked = chunkParagraphsOffline(text);
        if (!chunked.trim()) {
          setToolError('Passage could not be split into chunks.');
          return;
        }
        setResultText(chunked);
        setResultKind('offline');
        setResultSource('Offline Sentence-Boundary Paragraph Chunker');
        break;
      }
      case 'key-points': {
        const pts = extractKeyPointsOffline(text, 5);
        if (pts.length === 0) {
          setToolError('Passage has no complete sentences to extract key points from.');
          return;
        }
        setKeyPoints(pts);
        setResultKind('offline');
        setResultSource('Offline Extractive Key-Sentence Ranking');
        break;
      }
      case 'summarize': {
        const summary = summarizeOffline(text);
        if (!summary.trim()) {
          setToolError('Passage is too short for offline extractive summary.');
          return;
        }
        setResultText(summary);
        setResultKind('offline');
        setResultSource('Offline Extractive Summary');
        break;
      }
      case 'comprehension': {
        const recall = generateOfflineRecallPractice(text);
        if (recall.length === 0) {
          setToolError(
            'This passage is too short to build offline fill-in-the-blank recall items. Add a full sentence or try Gemini AI.',
          );
          return;
        }
        setOfflineRecall(recall);
        setResultKind('offline');
        setResultSource(
          'Offline Cloze Recall Practice (for open-ended AI comprehension Q&A, use Gemini AI)',
        );
        break;
      }
      case 'explain-words':
      case 'synonyms': {
        if (wordInput.trim() && containsTamilScript(wordInput)) {
          setToolError(
            'Free dictionary lookup supports English words only. Click "Run with Gemini AI" for Tamil word explanations and synonyms.',
          );
          return;
        }
        const candidateWord =
          wordInput.trim() ||
          difficultWords[0]?.word ||
          extractFallbackWord(text);
        if (candidateWord) {
          void lookupDictionaryWord(candidateWord);
        } else if (containsTamilScript(text)) {
          setToolError(
            'Free dictionary lookup only covers English words. Click "Run with Gemini AI" above to get Tamil word explanations and synonyms.',
          );
        } else {
          setToolError(
            'No English words were detected in the passage. Type any English word above to look it up.',
          );
        }
        break;
      }
    }
  };

  const runAiTool = async (tool: ToolId, overrideWord?: string) => {
    clearOutputs(false);
    const chosenWord = (overrideWord ?? wordInput).trim();
    const effectiveText = text.trim() || chosenWord;
    if (!effectiveText) {
      setToolError('Paste or load a passage first.');
      return;
    }

    const reqId = ++aiRequestIdRef.current;
    setLoadingTool(true);
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 48000);

    try {
      const apiTask = tool === 'explain-words' ? 'explain-word' : tool;
      const isWordTool = tool === 'explain-words' || tool === 'synonyms';
      const res = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: effectiveText,
          task: apiTask,
          targetWord: isWordTool ? chosenWord || undefined : undefined,
        }),
      });

      const raw = await res.text();
      if (reqId !== aiRequestIdRef.current) return;
      type AiTransformResponse = {
        error?: string;
        message?: string;
        result?: string;
        points?: string[];
        items?: AiWordItem[];
        questions?: AiQuestion[];
        model?: string;
      };
      let data: AiTransformResponse | null = null;

      try {
        data = JSON.parse(raw) as AiTransformResponse;
      } catch {
        data = null;
      }

      if (reqId !== aiRequestIdRef.current) return;

      if (!res.ok) {
        if (data?.error === 'AI_NOT_CONFIGURED') {
          setAiNoticeShowOfflineBtn(true);
          setAiNotice(
            data.message ||
              'Gemini AI integration is not configured on the server yet. Use the Offline / Free alternative below—no fake AI output is generated.',
          );
        } else {
          setToolError(
            data?.message ||
              `AI endpoint returned HTTP ${res.status}. You can retry or use the Offline / Free alternative below.`,
          );
        }
        return;
      }

      if (!data) {
        setToolError(
          'Received an unexpected response from the AI endpoint. Please retry or use the Offline / Free alternative below.',
        );
        return;
      }

      const modelLabel = `Gemini AI (${data.model ?? 'gemini-4-hydrogen'})`;

      if (data.result) {
        setResultText(data.result);
        setResultKind('ai');
        setResultSource(modelLabel);
      } else if (data.points && data.points.length > 0) {
        setKeyPoints(data.points);
        setResultKind('ai');
        setResultSource(modelLabel);
      } else if (data.items && data.items.length > 0) {
        setAiWords(data.items);
        setResultKind('ai');
        setResultSource(modelLabel);
      } else if (data.questions && data.questions.length > 0) {
        setAiQuestions(data.questions);
        setResultKind('ai');
        setResultSource(modelLabel);
      } else {
        setToolError(
          'Gemini AI did not return any content for this passage. Try again or use the Offline / Free alternative below.',
        );
      }
    } catch (err) {
      if (reqId !== aiRequestIdRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') {
        setToolError(
          'The AI request timed out while waiting for the server. Try a shorter passage or use the Offline / Free alternative below.',
        );
      } else {
        setToolError(
          'Could not reach the AI endpoint. Check your connection or use the Offline / Free alternative below.',
        );
      }
    } finally {
      window.clearTimeout(abortTimer);
      if (reqId === aiRequestIdRef.current) {
        setLoadingTool(false);
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header & Tab Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className={`font-display text-2xl sm:text-3xl font-bold ${tokens.text}`}>
            AI Tools &amp; English ↔ Tamil Translator
          </h1>
          <p className={`mt-1 text-sm sm:text-base ${tokens.subtext}`}>
            Simplify passages, explore word meanings, generate study prompts,
            and translate between English and Tamil.
          </p>
        </div>

        <div
          className={`inline-flex rounded-xl border p-1 self-start ${tokens.panelBg} ${tokens.border}`}
          role="tablist"
          aria-label="Tools or English-Tamil Translator"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tools'}
            onClick={() => setActiveTab('tools')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 min-h-[40px] text-sm font-semibold whitespace-nowrap ${
              activeTab === 'tools'
                ? 'bg-teal-600 text-white'
                : tokens.subtext
            }`}
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            AI &amp; Offline Tools
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'translate'}
            onClick={() => setActiveTab('translate')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 min-h-[40px] text-sm font-semibold whitespace-nowrap ${
              activeTab === 'translate'
                ? 'bg-teal-600 text-white'
                : tokens.subtext
            }`}
          >
            <Languages className="h-4 w-4" aria-hidden />
            English ↔ Tamil
          </button>
        </div>
      </div>

      {/* Honest AI integration banner */}
      {aiConfigured !== null && activeTab === 'tools' && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2 ${
            aiConfigured
              ? 'border-teal-500/40 bg-teal-600/10'
              : tokens.dark
                ? 'border-[#2D4366] bg-[#142238]'
                : 'border-cream-200 bg-cream-50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {aiConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" aria-hidden />
            )}
            <span className={tokens.text}>
              {aiConfigured
                ? 'Gemini AI is connected on the server. Both AI-powered and offline tools are active.'
                : 'AI integration note: Server Gemini AI key is not set (add GEMINI_API_KEY in Settings > Secrets for full LLM rewriting & Q&A). Offline rule-based tools and free Dictionary/Synonyms are active right now.'}
            </span>
          </div>
        </div>
      )}

      {activeTab === 'tools' ? (
        <>
          <section
            aria-label="Working passage"
            className={`rounded-2xl border p-4 sm:p-5 space-y-2 ${tokens.panelBg} ${tokens.border}`}
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ai-tools-source"
                className={`text-sm font-bold ${tokens.text}`}
              >
                Working passage (
                {text.trim() ? text.trim().split(/\s+/).length : 0} words)
              </label>
              <button
                type="button"
                onClick={() => onOpenInStudio()}
                disabled={!text.trim()}
                className={`text-xs font-semibold hover:underline disabled:opacity-40 ${
                  tokens.dark ? 'text-teal-400' : 'text-teal-700'
                }`}
              >
                Open in Reading Studio →
              </button>
            </div>
            <textarea
              id="ai-tools-source"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              rows={4}
              placeholder="Paste or type text here to analyze, simplify, or summarize…"
              className={`w-full resize-y rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed font-indic focus:border-teal-500 focus:outline-none ${tokens.input}`}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-12 items-start">
            {/* Left: 8 Tools Selector */}
            <div className="lg:col-span-4 space-y-2">
              <h2 className={`text-sm font-bold mb-2 ${tokens.subtext}`}>
                Choose a reading tool
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                {TOOL_LIST.map((tool) => {
                  const selected = selectedTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => {
                        setSelectedTool(tool.id);
                        clearOutputs(true);
                      }}
                      className={`text-left rounded-xl border px-3.5 py-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-1 ${
                        selected
                          ? 'border-teal-600 bg-teal-600 text-white'
                          : `${tokens.panelBg} ${tokens.border} ${tokens.text} hover:border-teal-500`
                      }`}
                    >
                      <span className="text-sm font-semibold">{tool.label}</span>
                      <span
                        className={`text-xs ${
                          selected ? 'text-teal-100' : tokens.subtext
                        }`}
                      >
                        {tool.offlineSupport}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Execution & Output Panel */}
            <div
              className={`lg:col-span-8 rounded-3xl border p-5 sm:p-6 space-y-5 ${tokens.panelBg} ${tokens.border}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className={`text-xl font-bold ${tokens.text}`}>
                    {TOOL_LIST.find((t) => t.id === selectedTool)?.label}
                  </h2>
                  <p className={`text-xs mt-0.5 ${tokens.subtext}`}>
                    {selectedTool === 'easier-english' ||
                    selectedTool === 'comprehension'
                      ? 'Best with Gemini AI; offline helper also available.'
                      : 'Run offline immediately or use Gemini AI when configured.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runOfflineTool(selectedTool)}
                    disabled={loadingTool}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 min-h-[42px] text-sm font-semibold whitespace-nowrap ${tokens.secondaryBtn}`}
                  >
                    {selectedTool === 'explain-words' || selectedTool === 'synonyms'
                      ? 'Run Free Lookup'
                      : 'Run Offline'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runAiTool(selectedTool)}
                    disabled={loadingTool}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 min-h-[42px] text-sm font-bold text-white hover:bg-teal-500 disabled:opacity-50 whitespace-nowrap"
                  >
                    {loadingTool ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    )}
                    Run with Gemini AI
                  </button>
                </div>
              </div>

              {(selectedTool === 'explain-words' ||
                selectedTool === 'synonyms') && (
                <div className="space-y-3 border-t pt-4 border-current/10">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={wordInput}
                      onChange={(e) => setWordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && wordInput.trim()) {
                          e.preventDefault();
                          void lookupWordOrTamil(wordInput);
                        }
                      }}
                      placeholder="Optional: type an English or Tamil word (or leave empty for passage words)…"
                      aria-label="Word to explain or find synonyms for"
                      className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm min-h-[42px] font-indic ${tokens.input}`}
                    />
                    {wordInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setWordInput('');
                          setDictResult(null);
                          setDictSource('');
                          setDictError(null);
                        }}
                        className={`rounded-xl border px-3 py-2.5 min-h-[42px] text-xs font-semibold whitespace-nowrap ${tokens.secondaryBtn}`}
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void lookupWordOrTamil(wordInput)}
                      disabled={dictLoading || loadingTool || !wordInput.trim()}
                      className="rounded-xl bg-teal-600 px-4 py-2.5 min-h-[42px] text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-45 whitespace-nowrap"
                    >
                      {dictLoading || loadingTool ? 'Looking up…' : 'Look up word'}
                    </button>
                  </div>

                  {difficultWords.length > 0 && (
                    <div className="space-y-1.5">
                      <p className={`text-xs font-semibold ${tokens.subtext}`}>
                        Detected multi-syllable English words (click to look up):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {difficultWords.map((item) => (
                          <button
                            key={item.word}
                            type="button"
                            onClick={() => void lookupDictionaryWord(item.word)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${tokens.secondaryBtn}`}
                          >
                            {item.word} ({item.syllables} syl)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {longTamilWords.length > 0 && (
                    <div className="space-y-1.5">
                      <p className={`text-xs font-semibold ${tokens.subtext}`}>
                        தமிழ் சொற்கள் (AI விளக்கம் / மாற்றுச் சொற்களுக்கு கிளிக் செய்யவும்):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {longTamilWords.map((item) => (
                          <button
                            key={item.word}
                            type="button"
                            onClick={() => void lookupWordOrTamil(item.word)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold font-indic transition-colors ${tokens.secondaryBtn}`}
                          >
                            {item.word}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {dictError && (
                    <p className="text-sm text-coral-600 font-medium">
                      {dictError}
                    </p>
                  )}

                  {dictResult && (
                    <div
                      className={`rounded-2xl border p-4 space-y-3 ${tokens.cardBg} ${tokens.border}`}
                    >
                      {dictSource && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                              tokens.dark
                                ? 'border-[#2D4366] bg-[#0F1B2E] text-[#D6E1F0]'
                                : 'border-cream-200 bg-white text-navy-700'
                            }`}
                          >
                            Free Dictionary Lookup
                          </span>
                          <span className={`text-xs font-medium ${tokens.subtext}`}>
                            {dictSource}
                          </span>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <h3 className={`text-lg font-bold capitalize ${tokens.text}`}>
                            {dictResult.word}
                          </h3>
                          {dictResult.phonetic && (
                            <span className={`text-sm ${tokens.subtext}`}>
                              {dictResult.phonetic}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => speech.play(dictResult.word)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                        >
                          <Volume2 className="h-3.5 w-3.5" aria-hidden />
                          Pronounce
                        </button>
                      </div>

                      {dictResult.meanings.length > 0 && (
                        <ul className="space-y-2 text-sm">
                          {dictResult.meanings.map((m, i) => (
                            <li key={i} className={tokens.text}>
                              <span
                                className={`font-semibold italic mr-2 ${tokens.dark ? 'text-teal-400' : 'text-teal-700'}`}
                              >
                                {m.partOfSpeech}
                              </span>
                              {m.definition}
                              {m.example && (
                                <p className={`text-xs mt-0.5 ${tokens.subtext}`}>
                                  Example: “{m.example}”
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {dictResult.synonyms.length > 0 && (
                        <div>
                          <p className={`text-xs font-semibold mb-1.5 ${tokens.subtext}`}>
                            Synonyms:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {dictResult.synonyms.map((syn) => (
                              <button
                                key={syn}
                                type="button"
                                onClick={() => void lookupDictionaryWord(syn)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${tokens.secondaryBtn}`}
                              >
                                {syn}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {aiNotice && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm font-medium flex flex-wrap items-center justify-between gap-3"
                >
                  <span>{aiNotice}</span>
                  {aiNoticeShowOfflineBtn && (
                    <button
                      type="button"
                      onClick={() => runOfflineTool(selectedTool)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold whitespace-nowrap ${tokens.secondaryBtn}`}
                    >
                      Use Offline / Free Alternative
                    </button>
                  )}
                </div>
              )}
              {toolError && (
                <div
                  role="alert"
                  className="rounded-xl border border-coral-500/40 bg-coral-500/10 px-4 py-3 text-sm font-medium text-coral-600 flex flex-wrap items-center justify-between gap-3"
                >
                  <span>{toolError}</span>
                  {(text.trim() || wordInput.trim()) && (
                    <button
                      type="button"
                      onClick={() => runOfflineTool(selectedTool)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold whitespace-nowrap ${tokens.secondaryBtn}`}
                    >
                      Run Offline / Free Alternative
                    </button>
                  )}
                </div>
              )}

              {resultText && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          resultKind === 'ai'
                            ? 'bg-teal-600 text-white'
                            : tokens.dark
                              ? 'border border-[#2D4366] bg-[#0F1B2E] text-[#D6E1F0]'
                              : 'border border-cream-200 bg-white text-navy-700'
                        }`}
                      >
                        {resultKind === 'ai' ? 'AI-Powered' : 'Offline Rule-Based'}
                      </span>
                      <span className={`text-xs font-semibold ${tokens.subtext}`}>
                        {resultSource}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopy(resultText, 'result-text')}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        {copiedId === 'result-text' ? (
                          <Check className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {copiedId === 'result-text' ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => speech.play(resultText)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden />
                        Listen
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveToLibrary(resultText, 'ai')}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        <BookMarked className="h-3.5 w-3.5" aria-hidden />
                        Save to Library
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenInStudio(resultText, 'ai')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
                      >
                        Open in Studio
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {speech.voiceWarning && (
                    <p className="text-xs font-medium text-coral-600">
                      {speech.voiceWarning}
                    </p>
                  )}

                  <div
                    className={`rounded-2xl border p-4 sm:p-5 whitespace-pre-wrap text-base leading-relaxed font-indic ${tokens.cardBg} ${tokens.border} ${tokens.text}`}
                  >
                    {resultText}
                  </div>

                  {wordChanges.length > 0 && (
                    <div className={`text-xs space-y-1 ${tokens.subtext}`}>
                      <p className="font-semibold">
                        Word substitutions applied:
                      </p>
                      <p>
                        {wordChanges
                          .map((c) => `${c.original} → ${c.simpler}`)
                          .join(' · ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {keyPoints.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          resultKind === 'ai'
                            ? 'bg-teal-600 text-white'
                            : tokens.dark
                              ? 'border border-[#2D4366] bg-[#0F1B2E] text-[#D6E1F0]'
                              : 'border border-cream-200 bg-white text-navy-700'
                        }`}
                      >
                        {resultKind === 'ai' ? 'AI-Powered' : 'Offline Rule-Based'}
                      </span>
                      <span className={`text-xs font-semibold ${tokens.subtext}`}>
                        {resultSource}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy(
                            keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
                            'key-points',
                          )
                        }
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        {copiedId === 'key-points' ? (
                          <Check className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {copiedId === 'key-points' ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => speech.play(keyPoints.join(' '))}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden />
                        Listen
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSaveToLibrary(keyPoints.map((p) => `• ${p}`).join('\n\n'), 'ai')
                        }
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        <BookMarked className="h-3.5 w-3.5" aria-hidden />
                        Save to Library
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenInStudio(keyPoints.join('\n\n'), 'ai')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
                      >
                        Open in Studio
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {keyPoints.map((pt, i) => (
                      <li
                        key={i}
                        className={`rounded-xl border p-3.5 text-sm leading-relaxed font-indic ${tokens.cardBg} ${tokens.border} ${tokens.text}`}
                      >
                        <span className="font-bold text-teal-600 mr-2 tabular-nums">
                          {i + 1}.
                        </span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiWords.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-teal-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        AI-Powered
                      </span>
                      <span className={`text-xs font-semibold ${tokens.subtext}`}>
                        {resultSource}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopy(
                          aiWords
                            .map(
                              (w) =>
                                `${w.word}: ${w.simpleMeaning}${w.synonyms.length ? ` (${w.synonyms.join(', ')})` : ''}`,
                            )
                            .join('\n'),
                          'ai-words',
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                    >
                      {copiedId === 'ai-words' ? (
                        <Check className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {copiedId === 'ai-words' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {aiWords.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-4 space-y-2 ${tokens.cardBg} ${tokens.border}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h3 className={`font-bold text-base font-indic ${tokens.text}`}>
                            {item.word}
                          </h3>
                          <button
                            type="button"
                            onClick={() => speech.play(item.word)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${tokens.secondaryBtn}`}
                            aria-label={`Pronounce ${item.word}`}
                          >
                            <Volume2 className="h-3 w-3" aria-hidden />
                            Listen
                          </button>
                        </div>
                        <p className={`text-sm font-indic ${tokens.subtext}`}>
                          {item.simpleMeaning}
                        </p>
                        {item.synonyms.length > 0 && (
                          <p className={`text-xs font-indic ${tokens.subtext}`}>
                            <span className="font-semibold">Simpler words: </span>
                            {item.synonyms.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-teal-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        AI-Powered
                      </span>
                      <span className={`text-xs font-semibold ${tokens.subtext}`}>
                        {resultSource}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopy(
                          aiQuestions
                            .map(
                              (q, i) =>
                                `${i + 1}. ${q.question}\nAnswer: ${q.answer}`,
                            )
                            .join('\n\n'),
                          'ai-questions',
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                    >
                      {copiedId === 'ai-questions' ? (
                        <Check className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {copiedId === 'ai-questions' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {aiQuestions.map((q, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2xl border p-4 space-y-2 ${tokens.cardBg} ${tokens.border}`}
                    >
                      <p className={`font-bold text-sm ${tokens.text}`}>
                        {idx + 1}. {q.question}
                      </p>
                      <p className={`text-xs ${tokens.subtext}`}>
                        Hint: {q.hint}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedAnswers((prev) => ({
                            ...prev,
                            [idx]: !prev[idx],
                          }))
                        }
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        {revealedAnswers[idx] ? 'Hide answer' : 'Reveal answer'}
                      </button>
                      {revealedAnswers[idx] && (
                        <p
                          className={`text-sm font-medium pt-1 ${
                            tokens.dark ? 'text-teal-300' : 'text-teal-700'
                          }`}
                        >
                          {q.answer}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {offlineRecall.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                        tokens.dark
                          ? 'border-[#2D4366] bg-[#0F1B2E] text-[#D6E1F0]'
                          : 'border-cream-200 bg-white text-navy-700'
                      }`}
                    >
                      Offline Rule-Based
                    </span>
                    <span className={`text-xs font-semibold ${tokens.subtext}`}>
                      {resultSource}
                    </span>
                  </div>
                  {offlineRecall.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2xl border p-4 space-y-2 ${tokens.cardBg} ${tokens.border}`}
                    >
                      <p className={`text-sm leading-relaxed ${tokens.text}`}>
                        <span className="font-bold mr-2 tabular-nums">
                          {idx + 1}.
                        </span>
                        {item.prompt}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedAnswers((prev) => ({
                            ...prev,
                            [idx]: !prev[idx],
                          }))
                        }
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${tokens.secondaryBtn}`}
                      >
                        {revealedAnswers[idx] ? 'Hide answer' : 'Show missing word'}
                      </button>
                      {revealedAnswers[idx] && (
                        <p
                          className={`text-sm font-semibold ${
                            tokens.dark ? 'text-teal-300' : 'text-teal-700'
                          }`}
                        >
                          Answer: {item.answer}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <TamilTranslator
          workspaceText={text}
          aiConfigured={aiConfigured}
          speech={speech}
          tokens={tokens}
          onOpenInStudio={(translated) =>
            onOpenInStudio(translated, 'translated')
          }
          onSaveToLibrary={(translated) =>
            onSaveToLibrary(translated, 'translated')
          }
        />
      )}
    </div>
  );
}
