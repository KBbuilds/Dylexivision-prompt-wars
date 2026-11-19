import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BookOpenText,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  Home,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { SliderControl } from '@/components/Controls';
import { ReadingRuler } from '@/components/ReadingRuler';
import { SpeechPanel } from '@/components/SpeechPanel';
import { containsTamilScript } from '@/lib/languages';
import {
  analyzeEnglishMorphologyOffline,
  analyzeTamilWordOffline,
  buildReadingChunks,
  classifyTamilGraphemeVowel,
  detectDifficultWords,
  detectLongTamilWords,
  detectSentenceEndPunctuation,
  findWordIndexAtCharOffset,
  getMirrorLetterKey,
  groupTamilSoundUnits,
  parsePassage,
  segmentTamilGraphemes,
  splitBionicToken,
  splitEnglishSyllables,
  tokenizeSentence,
  type EnglishMorphologyAnalysis,
  type MirrorLetterKey,
  type ParagraphBlock,
  type PunctuationKind,
  type TamilSandhiAnalysis,
  type TamilVowelMarkerKind,
} from '@/lib/textProcessing';
import type { SpeechController } from '@/hooks/useSpeech';
import {
  FONT_OPTIONS,
  LIMITS,
  READING_MODES,
  READING_WIDTH_CLASSES,
  THEME_PRESETS,
  themeClasses,
  type ReadingMode,
  type ReadingSettings,
  type ReadingWidth,
  type RulerColor,
  type RulerFocusArea,
  type TextAlignment,
} from '@/settings';

interface ReaderPageProps {
  text: string;
  settings: ReadingSettings;
  onSettingsChange: (patch: Partial<ReadingSettings>) => void;
  onReset: () => void;
  onBackHome: () => void;
  onSaveToLibrary: () => void;
  onProgressChange: (sentenceIndex: number, totalSentences: number) => void;
  initialSentenceIndex?: number;
  speech: SpeechController;
  savedNotice: string | null;
}

type SidebarTab = 'typography' | 'themes' | 'aids' | 'tools' | 'speech';

function getPunctuationStyle(kind: PunctuationKind | undefined, dark: boolean): string {
  switch (kind) {
    case 'comma':
    case 'colon':
    case 'semicolon':
      return dark
        ? 'text-amber-300 bg-amber-400/20'
        : 'text-amber-800 bg-amber-400/20';
    case 'period':
      return dark
        ? 'text-teal-300 bg-teal-400/20'
        : 'text-teal-800 bg-teal-500/15';
    case 'question':
    case 'exclamation':
      return dark
        ? 'text-[#FF8A80] bg-coral-500/25'
        : 'text-coral-600 bg-coral-500/15';
    case 'quote':
      return dark
        ? 'text-sky-300 bg-sky-400/20'
        : 'text-sky-800 bg-sky-500/15';
    default:
      return '';
  }
}

function getMirrorLetterStyle(key: MirrorLetterKey, dark: boolean): string {
  switch (key) {
    case 'b':
      return dark
        ? 'bg-teal-500/25 text-teal-200 border-b-2 border-teal-400 rounded-[2px] px-[0.5px]'
        : 'bg-teal-500/15 text-teal-900 border-b-2 border-teal-600 rounded-[2px] px-[0.5px]';
    case 'd':
      return dark
        ? 'bg-amber-400/25 text-amber-200 border-b-2 border-amber-400 rounded-[2px] px-[0.5px]'
        : 'bg-amber-400/20 text-amber-900 border-b-2 border-amber-600 rounded-[2px] px-[0.5px]';
    case 'p':
      return dark
        ? 'bg-sky-400/25 text-sky-200 border-b-2 border-sky-400 rounded-[2px] px-[0.5px]'
        : 'bg-sky-500/15 text-sky-900 border-b-2 border-sky-600 rounded-[2px] px-[0.5px]';
    case 'q':
      return dark
        ? 'bg-coral-500/25 text-[#FF9E94] border-b-2 border-coral-400 rounded-[2px] px-[0.5px]'
        : 'bg-coral-500/15 text-coral-600 border-b-2 border-coral-600 rounded-[2px] px-[0.5px]';
    case 'm':
      return dark
        ? 'bg-violet-400/25 text-violet-200 border-b-2 border-violet-400 rounded-[2px] px-[0.5px]'
        : 'bg-violet-500/15 text-violet-900 border-b-2 border-violet-600 rounded-[2px] px-[0.5px]';
    case 'w':
      return dark
        ? 'bg-emerald-400/25 text-emerald-200 border-b-2 border-emerald-400 rounded-[2px] px-[0.5px]'
        : 'bg-emerald-500/15 text-emerald-900 border-b-2 border-emerald-600 rounded-[2px] px-[0.5px]';
  }
}

function getTamilVowelStyle(kind: TamilVowelMarkerKind, dark: boolean): string {
  switch (kind) {
    case 'aa-kal':
      return dark
        ? 'bg-amber-400/20 text-amber-200 rounded-[3px] px-[1px]'
        : 'bg-amber-400/25 text-amber-950 rounded-[3px] px-[1px]';
    case 'i-ee':
      return dark
        ? 'bg-teal-400/20 text-teal-200 rounded-[3px] px-[1px]'
        : 'bg-teal-500/15 text-teal-950 rounded-[3px] px-[1px]';
    case 'u-uu':
      return dark
        ? 'bg-sky-400/20 text-sky-200 rounded-[3px] px-[1px]'
        : 'bg-sky-500/15 text-sky-950 rounded-[3px] px-[1px]';
    case 'e-ee-ai':
      return dark
        ? 'bg-violet-400/20 text-violet-200 rounded-[3px] px-[1px]'
        : 'bg-violet-500/15 text-violet-950 rounded-[3px] px-[1px]';
    case 'two-part':
      return dark
        ? 'bg-coral-500/25 text-[#FFAD9F] rounded-[3px] px-[1px]'
        : 'bg-coral-500/15 text-coral-700 rounded-[3px] px-[1px]';
    default:
      return '';
  }
}

const PUNCTUATION_LEGEND_ITEMS: Array<{
  symbol: string;
  name: string;
  purpose: string;
  kind: PunctuationKind;
}> = [
  { symbol: ',', name: 'Comma', purpose: 'Short pause between ideas', kind: 'comma' },
  { symbol: '.', name: 'Full stop', purpose: 'End of a sentence', kind: 'period' },
  { symbol: '?', name: 'Question mark', purpose: 'Marks a question', kind: 'question' },
  { symbol: '!', name: 'Exclamation mark', purpose: 'Strong feeling or emphasis', kind: 'exclamation' },
  { symbol: ':', name: 'Colon', purpose: 'Introduces a list or quote', kind: 'colon' },
  { symbol: ';', name: 'Semicolon', purpose: 'Links related clauses', kind: 'semicolon' },
  { symbol: '“ ”', name: 'Quotation marks', purpose: 'Marks speech or quotes', kind: 'quote' },
];

const TAMIL_VOWEL_LEGEND: Array<{
  sample: string;
  markers: string;
  nameTa: string;
  kind: TamilVowelMarkerKind;
}> = [
  { sample: 'கா', markers: 'ா', nameTa: 'துணைக்கால்', kind: 'aa-kal' },
  { sample: 'கி · கீ', markers: 'ி · ீ', nameTa: 'இ / ஈ குறியீடு', kind: 'i-ee' },
  { sample: 'கு · கூ', markers: 'ு · ூ', nameTa: 'உ / ஊ வளைவு', kind: 'u-uu' },
  { sample: 'கெ · கே · கை', markers: 'ெ · ே · ை', nameTa: 'கொம்பு வகை', kind: 'e-ee-ai' },
  { sample: 'கொ · கோ · கௌ', markers: 'ொ · ோ · ௌ', nameTa: 'இருபக்க குறியீடு', kind: 'two-part' },
];

function renderEnglishLetters(
  segment: string,
  mirrorLetterAlert: boolean,
  boldChars: number,
  startOffset: number,
): ReactNode {
  if (!mirrorLetterAlert && boldChars <= 0) {
    return segment;
  }

  return Array.from(segment).map((ch, idx) => {
    const absIdx = startOffset + idx;
    const isBold = absIdx < boldChars;
    const mirrorKey = mirrorLetterAlert ? getMirrorLetterKey(ch) : null;
    if (!mirrorKey && !isBold) {
      return <Fragment key={idx}>{ch}</Fragment>;
    }
    return (
      <span
        key={idx}
        className={`${isBold ? 'font-bold' : ''} ${
          mirrorKey ? getMirrorLetterStyle(mirrorKey, false) : ''
        }`}
      >
        {ch}
      </span>
    );
  });
}

function renderFormattedWord({
  word,
  bionic,
  mirrorLetterAlert,
  englishSyllables,
  tamilSyllableGrouping,
  tamilVowelHighlight,
  dark,
}: {
  word: string;
  bionic: boolean;
  mirrorLetterAlert: boolean;
  englishSyllables: boolean;
  tamilSyllableGrouping: boolean;
  tamilVowelHighlight: boolean;
  dark: boolean;
}): ReactNode {
  const isTamilWord = containsTamilScript(word);

  if (isTamilWord) {
    if (!tamilSyllableGrouping && !tamilVowelHighlight) {
      return word;
    }

    const units = tamilSyllableGrouping
      ? groupTamilSoundUnits(word)
      : [word];

    return units.map((unit, uIdx) => {
      const graphemes = tamilVowelHighlight ? segmentTamilGraphemes(unit) : [unit];
      const inner = tamilVowelHighlight
        ? graphemes.map((g, gIdx) => {
            const info = classifyTamilGraphemeVowel(g);
            if (info.kind === 'none' || info.kind === 'pulli') {
              return <Fragment key={gIdx}>{g}</Fragment>;
            }
            return (
              <span key={gIdx} className={getTamilVowelStyle(info.kind, dark)}>
                {g}
              </span>
            );
          })
        : unit;

      if (!tamilSyllableGrouping || units.length <= 1) {
        return <Fragment key={uIdx}>{inner}</Fragment>;
      }

      const isLast = uIdx === units.length - 1;
      return (
        <span
          key={uIdx}
          className={`inline ${
            uIdx % 2 === 1
              ? dark
                ? 'bg-white/5 rounded-[3px]'
                : 'bg-teal-500/8 rounded-[3px]'
              : ''
          } ${
            !isLast
              ? 'border-r border-teal-500/40 pr-[2px] mr-[2px]'
              : ''
          }`}
        >
          {inner}
        </span>
      );
    });
  }

  // English / Latin word formatting
  const bionicSplit = bionic ? splitBionicToken(word) : null;
  const boldCount = bionicSplit?.boldPart ? bionicSplit.boldPart.length : 0;
  const leadingLen = bionicSplit?.leadingPunct.length ?? 0;

  // English syllable splitting only on pure Latin words when enabled
  const canSyllabify = englishSyllables && /^[A-Za-z]+$/.test(word);
  if (canSyllabify) {
    const syllables = splitEnglishSyllables(word);
    if (syllables.length > 1) {
      let runningOffset = 0;
      return syllables.map((syl, sIdx) => {
        const startOffset = runningOffset;
        runningOffset += syl.length;
        const isLast = sIdx === syllables.length - 1;

        const sylNodes = Array.from(syl).map((ch, cIdx) => {
          const globalPos = startOffset + cIdx;
          const isBold = globalPos < boldCount;
          const mirrorKey = mirrorLetterAlert ? getMirrorLetterKey(ch) : null;
          if (!isBold && !mirrorKey) {
            return <Fragment key={cIdx}>{ch}</Fragment>;
          }
          return (
            <span
              key={cIdx}
              className={`${isBold ? 'font-bold' : ''} ${
                mirrorKey ? getMirrorLetterStyle(mirrorKey, dark) : ''
              }`}
            >
              {ch}
            </span>
          );
        });

        return (
          <span
            key={sIdx}
            className={`inline ${
              sIdx % 2 === 1
                ? dark
                  ? 'bg-white/5 rounded-[3px]'
                  : 'bg-teal-500/10 rounded-[3px]'
                : ''
            } ${
              !isLast
                ? 'border-r border-current/25 pr-[1.5px] mr-[1.5px]'
                : ''
            }`}
          >
            {sylNodes}
          </span>
        );
      });
    }
  }

  if (mirrorLetterAlert) {
    return Array.from(word).map((ch, idx) => {
      const mirrorKey = getMirrorLetterKey(ch);
      const isBold =
        bionic &&
        boldCount > 0 &&
        idx >= leadingLen &&
        idx < leadingLen + boldCount;
      if (!mirrorKey && !isBold) {
        return <Fragment key={idx}>{ch}</Fragment>;
      }
      return (
        <span
          key={idx}
          className={`${isBold ? 'font-bold' : ''} ${
            mirrorKey ? getMirrorLetterStyle(mirrorKey, dark) : ''
          }`}
        >
          {ch}
        </span>
      );
    });
  }

  if (bionic && bionicSplit?.boldPart) {
    return (
      <>
        {bionicSplit.leadingPunct}
        <strong className="font-bold">{bionicSplit.boldPart}</strong>
        {bionicSplit.restPart}
        {bionicSplit.trailingPunct}
      </>
    );
  }

  void renderEnglishLetters;
  return word;
}

function RenderSentenceText({
  text,
  bionic,
  punctuationFocus,
  mirrorLetterAlert,
  englishSyllables,
  tamilSyllableGrouping,
  tamilVowelHighlight,
  karaokeMode,
  isSpokenSentence,
  activeWordIndex,
  dark,
  onWordClick,
  activeWordRef,
}: {
  text: string;
  bionic: boolean;
  punctuationFocus: boolean;
  mirrorLetterAlert: boolean;
  englishSyllables: boolean;
  tamilSyllableGrouping: boolean;
  tamilVowelHighlight: boolean;
  karaokeMode: boolean;
  isSpokenSentence: boolean;
  activeWordIndex: number | null;
  dark: boolean;
  onWordClick?: (charStart: number) => void;
  activeWordRef?: (el: HTMLSpanElement | null) => void;
}) {
  const anyAidActive =
    bionic ||
    punctuationFocus ||
    mirrorLetterAlert ||
    englishSyllables ||
    tamilSyllableGrouping ||
    tamilVowelHighlight ||
    karaokeMode;

  const tokens = useMemo(
    () => (anyAidActive ? tokenizeSentence(text) : []),
    [text, anyAidActive],
  );

  if (!anyAidActive) {
    return <>{text}</>;
  }

  return (
    <>
      {tokens.map((token, idx) => {
        if (token.kind === 'space' || token.kind === 'other') {
          return <Fragment key={idx}>{token.text}</Fragment>;
        }

        if (token.kind === 'punct') {
          if (!punctuationFocus) {
            return <Fragment key={idx}>{token.text}</Fragment>;
          }
          const isBoundaryMark =
            isSpokenSentence &&
            (token.punctKind === 'period' ||
              token.punctKind === 'question' ||
              token.punctKind === 'exclamation');
          const styleCls = getPunctuationStyle(token.punctKind, dark);
          return (
            <span
              key={idx}
              className={`inline rounded px-[1.5px] font-bold transition-colors ${styleCls} ${
                isBoundaryMark ? 'ring-1 ring-current/50' : ''
              }`}
            >
              {token.text}
            </span>
          );
        }

        const wordContent = renderFormattedWord({
          word: token.text,
          bionic,
          mirrorLetterAlert,
          englishSyllables,
          tamilSyllableGrouping,
          tamilVowelHighlight,
          dark,
        });

        if (!karaokeMode) {
          return <Fragment key={idx}>{wordContent}</Fragment>;
        }

        const isActiveWord =
          activeWordIndex !== null && token.wordIndex === activeWordIndex;

        return (
          <span
            key={idx}
            ref={isActiveWord ? activeWordRef : undefined}
            onClick={(e) => {
              if (window.getSelection()?.toString()) return;
              e.stopPropagation();
              onWordClick?.(token.charStart);
            }}
            title="Click word to start Karaoke Reading from here"
            className={`cursor-pointer rounded transition-colors ${
              isActiveWord
                ? dark
                  ? 'bg-amber-400 text-[#0F1B2E] font-bold px-1 -mx-0.5 shadow-sm ring-2 ring-amber-300/70'
                  : 'bg-amber-300/95 text-[#0F1B2E] font-bold px-1 -mx-0.5 shadow-sm ring-2 ring-amber-500/50'
                : 'hover:bg-teal-500/15'
            }`}
          >
            {wordContent}
          </span>
        );
      })}
    </>
  );
}

export function ReaderPage({
  text,
  settings,
  onSettingsChange,
  onReset,
  onBackHome,
  onSaveToLibrary,
  onProgressChange,
  initialSentenceIndex = 0,
  speech,
  savedNotice,
}: ReaderPageProps) {
  const tokens = themeClasses(
    settings.theme,
    settings.customTextColor,
    settings.customBgColor,
  );
  const dark = tokens.dark;

  const { paragraphs, sentences } = useMemo(() => parsePassage(text), [text]);
  const chunks = useMemo(
    () => buildReadingChunks(paragraphs, settings.chunkSize),
    [paragraphs, settings.chunkSize],
  );

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('typography');
  const [selectedSentenceIndex, setSelectedSentenceIndex] = useState<number>(
    initialSentenceIndex,
  );
  const [chunkIndex, setChunkIndex] = useState(0);
  const [showFocusSidebar, setShowFocusSidebar] = useState(false);
  const [showPunctLegend, setShowPunctLegend] = useState(false);
  const [showMirrorHint, setShowMirrorHint] = useState(false);
  const [showTamilVowelLegend, setShowTamilVowelLegend] = useState(false);

  // English Prefix/Root/Suffix Explorer state
  const englishPassageWords = useMemo(() => detectDifficultWords(text, 8), [text]);
  const [morphWordInput, setMorphWordInput] = useState('');
  const [morphResult, setMorphResult] = useState<EnglishMorphologyAnalysis | null>(null);
  const [morphLoading, setMorphLoading] = useState(false);
  const [morphError, setMorphError] = useState<string | null>(null);

  // Tamil Compound Word Splitter (சந்தி பிரித்தல்) state
  const tamilPassageWords = useMemo(() => detectLongTamilWords(text, 8), [text]);
  const [sandhiWordInput, setSandhiWordInput] = useState('');
  const [sandhiResult, setSandhiResult] = useState<TamilSandhiAnalysis | null>(null);
  const [sandhiLoading, setSandhiLoading] = useState(false);
  const [sandhiError, setSandhiError] = useState<string | null>(null);

  const sentenceRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const activeWordElRef = useRef<HTMLSpanElement | null>(null);
  const setActiveWordElRef = useCallback((el: HTMLSpanElement | null) => {
    activeWordElRef.current = el;
  }, []);

  const sentenceTexts = useMemo(
    () => sentences.map((s) => s.text),
    [sentences],
  );

  // Sync Punctuation Focus pause awareness into Read Aloud
  const { setPunctuationPauses } = speech;
  useEffect(() => {
    setPunctuationPauses(settings.punctuationFocus);
  }, [settings.punctuationFocus, setPunctuationPauses]);

  // Sync initial sentence when reopening a library item
  useEffect(() => {
    const clamped = Math.max(
      0,
      Math.min(initialSentenceIndex, Math.max(0, sentences.length - 1)),
    );
    setSelectedSentenceIndex(clamped);
  }, [initialSentenceIndex, sentences.length]);

  // Keep chunk index in valid range when chunk size or text changes
  useEffect(() => {
    setChunkIndex((prev) =>
      Math.max(0, Math.min(prev, Math.max(0, chunks.length - 1))),
    );
  }, [chunks.length]);

  const activeHighlightIndex =
    speech.speaking &&
    speech.activeSpeechMode === 'passage' &&
    speech.currentSentenceIndex !== null
      ? speech.currentSentenceIndex
      : selectedSentenceIndex;

  // Auto-advance chunk when speech crosses chunk boundary
  useEffect(() => {
    if (
      settings.readingMode === 'chunk' &&
      speech.speaking &&
      speech.activeSpeechMode === 'passage' &&
      speech.currentSentenceIndex !== null
    ) {
      const idx = chunks.findIndex(
        (c) =>
          speech.currentSentenceIndex! >= c.startSentence &&
          speech.currentSentenceIndex! <= c.endSentence,
      );
      if (idx !== -1 && idx !== chunkIndex) {
        setChunkIndex(idx);
      }
    }
  }, [
    settings.readingMode,
    speech.speaking,
    speech.activeSpeechMode,
    speech.currentSentenceIndex,
    chunks,
    chunkIndex,
  ]);

  // Auto-scroll active spoken word or sentence into view
  useEffect(() => {
    if (!speech.speaking || speech.activeSpeechMode !== 'passage') {
      return;
    }
    if (
      settings.readingMode === 'karaoke' &&
      speech.wordSyncStatus === 'supported' &&
      activeWordElRef.current
    ) {
      activeWordElRef.current.scrollIntoView({
        behavior: settings.reducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
      return;
    }
    if (speech.currentSentenceIndex !== null) {
      const el = sentenceRefs.current[speech.currentSentenceIndex];
      if (el) {
        el.scrollIntoView({
          behavior: settings.reducedMotion ? 'auto' : 'smooth',
          block: 'center',
        });
      }
    }
  }, [
    speech.speaking,
    speech.activeSpeechMode,
    speech.currentSentenceIndex,
    speech.currentWordCharIndex,
    speech.wordSyncStatus,
    settings.readingMode,
    settings.reducedMotion,
  ]);

  // Persist reading progress
  useEffect(() => {
    if (sentences.length > 0) {
      onProgressChange(activeHighlightIndex, sentences.length);
    }
  }, [activeHighlightIndex, sentences.length, onProgressChange]);

  const handleModeChange = useCallback(
    (mode: ReadingMode) => {
      if (mode === 'line-focus') {
        onSettingsChange({ readingMode: mode, rulerEnabled: true });
      } else {
        onSettingsChange({ readingMode: mode });
      }
      if (mode !== 'focus') {
        setShowFocusSidebar(false);
      }
    },
    [onSettingsChange],
  );

  // Studio keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape' && settings.readingMode === 'focus') {
        e.preventDefault();
        handleModeChange('comfortable');
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleModeChange(
          settings.readingMode === 'focus' ? 'comfortable' : 'focus',
        );
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onSettingsChange({ rulerEnabled: !settings.rulerEnabled });
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        onSettingsChange({ bionicReading: !settings.bionicReading });
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        onSettingsChange({ punctuationFocus: !settings.punctuationFocus });
        return;
      }
      if (e.key === ' ' && target?.tagName !== 'BUTTON') {
        e.preventDefault();
        if (speech.speaking && !speech.paused) {
          speech.pause();
        } else if (speech.speaking && speech.paused) {
          speech.resume();
        } else {
          speech.playSentences(sentenceTexts, selectedSentenceIndex);
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        if (settings.readingMode === 'chunk') {
          e.preventDefault();
          setChunkIndex((c) => Math.min(chunks.length - 1, c + 1));
        } else if (sentences.length > 0) {
          e.preventDefault();
          setSelectedSentenceIndex((idx) =>
            Math.min(sentences.length - 1, idx + 1),
          );
        }
      } else if (e.key === 'ArrowLeft') {
        if (settings.readingMode === 'chunk') {
          e.preventDefault();
          setChunkIndex((c) => Math.max(0, c - 1));
        } else if (sentences.length > 0) {
          e.preventDefault();
          setSelectedSentenceIndex((idx) => Math.max(0, idx - 1));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    settings.readingMode,
    settings.rulerEnabled,
    settings.bionicReading,
    settings.punctuationFocus,
    chunks.length,
    sentences,
    sentenceTexts,
    selectedSentenceIndex,
    speech,
    handleModeChange,
    onSettingsChange,
  ]);

  // Never automatically speak when clicking, touching, selecting, scrolling, or copying text
  const handleSentenceClick = (sentenceIdx: number) => {
    if (window.getSelection()?.toString()) return;
    if (isSentenceFocusMode) {
      setSelectedSentenceIndex(sentenceIdx);
    }
  };

  const handleWordClick = useCallback(
    (sentenceIdx: number, charStart: number) => {
      if (window.getSelection()?.toString()) return;
      setSelectedSentenceIndex(sentenceIdx);
      if (speech.supported) {
        speech.playFromWord(sentenceTexts, sentenceIdx, charStart);
      }
    },
    [speech, sentenceTexts],
  );

  const runEnglishMorphology = async (wordToAnalyze: string, useAi: boolean) => {
    const clean = wordToAnalyze.trim();
    if (!clean) {
      setMorphError('Enter or select an English word first.');
      return;
    }
    setMorphWordInput(clean);
    setMorphError(null);
    if (!useAi) {
      setMorphResult(analyzeEnglishMorphologyOffline(clean));
      return;
    }
    setMorphLoading(true);
    try {
      const res = await fetch('/api/reading-tools/english-morphology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: clean,
          context: sentences[activeHighlightIndex]?.text,
        }),
      });
      const data = (await res.json()) as EnglishMorphologyAnalysis & { message?: string };
      if (!res.ok) {
        setMorphError(data.message || 'AI morphology unavailable; showing offline rule-based breakdown.');
        setMorphResult(analyzeEnglishMorphologyOffline(clean));
      } else {
        setMorphResult({ ...data, provider: 'gemini' });
      }
    } catch {
      setMorphError('Could not reach AI service; showing offline rule-based breakdown.');
      setMorphResult(analyzeEnglishMorphologyOffline(clean));
    } finally {
      setMorphLoading(false);
    }
  };

  const runTamilSandhi = async (wordToSplit: string, useAi: boolean) => {
    const clean = wordToSplit.trim();
    if (!clean || !containsTamilScript(clean)) {
      setSandhiError('சந்தி பிரிப்பதற்கு ஒரு தமிழ் சொல்லை உள்ளிடவும்.');
      return;
    }
    setSandhiWordInput(clean);
    setSandhiError(null);
    if (!useAi) {
      setSandhiResult(analyzeTamilWordOffline(clean));
      return;
    }
    setSandhiLoading(true);
    try {
      const res = await fetch('/api/reading-tools/tamil-sandhi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: clean,
          context: sentences[activeHighlightIndex]?.text,
        }),
      });
      const data = (await res.json()) as TamilSandhiAnalysis & { message?: string };
      if (!res.ok) {
        setSandhiError(
          data.message || 'AI சந்தி பிரிப்பு இப்போது கிடைக்கவில்லை; அடிப்படைப் பிரிப்பு காட்டப்படுகிறது.',
        );
        setSandhiResult(analyzeTamilWordOffline(clean));
      } else {
        setSandhiResult({ ...data, provider: 'gemini' });
      }
    } catch {
      setSandhiError('AI சேவையைத் தொடர்பு கொள்ள முடியவில்லை; அடிப்படைப் பிரிப்பு காட்டப்படுகிறது.');
      setSandhiResult(analyzeTamilWordOffline(clean));
    } finally {
      setSandhiLoading(false);
    }
  };

  const isFocusMode = settings.readingMode === 'focus';
  const isSentenceFocusMode = settings.readingMode === 'sentence-focus';
  const isChunkMode = settings.readingMode === 'chunk';
  const isParagraphMode = settings.readingMode === 'paragraph';
  const isKaraokeMode = settings.readingMode === 'karaoke';

  const activeSpokenWordIndex = useMemo(() => {
    if (
      !isKaraokeMode ||
      !speech.speaking ||
      speech.activeSpeechMode !== 'passage' ||
      speech.wordSyncStatus !== 'supported' ||
      speech.currentSentenceIndex === null ||
      speech.currentWordCharIndex === null
    ) {
      return null;
    }
    const sentence = sentences[speech.currentSentenceIndex];
    if (!sentence) return null;
    const tokens = tokenizeSentence(sentence.text);
    return findWordIndexAtCharOffset(tokens, speech.currentWordCharIndex);
  }, [
    isKaraokeMode,
    speech.speaking,
    speech.activeSpeechMode,
    speech.wordSyncStatus,
    speech.currentSentenceIndex,
    speech.currentWordCharIndex,
    sentences,
  ]);

  const currentChunk = chunks[chunkIndex];
  const visibleParagraphs: ParagraphBlock[] =
    isChunkMode && currentChunk ? currentChunk.paragraphs : paragraphs;

  const widthClass = READING_WIDTH_CLASSES[settings.readingWidth];
  const alignClass =
    settings.textAlign === 'center'
      ? 'text-center'
      : settings.textAlign === 'justify'
        ? 'text-justify'
        : 'text-left';

  const rulerActive =
    settings.rulerEnabled || settings.readingMode === 'line-focus';

  const renderParagraphBlocks = (blocks: ParagraphBlock[]) => {
    if (isParagraphMode) {
      return (
        <div className="space-y-4">
          {blocks.map((block) => (
            <div
              key={block.paragraphIndex}
              className={`rounded-2xl border p-5 sm:p-6 transition-colors ${tokens.border}`}
              style={{
                ...tokens.textStyles,
                marginBottom: `${settings.paragraphSpacing * 0.5}em`,
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-2 text-xs opacity-70">
                <span className="font-semibold tabular-nums">
                  Paragraph {block.paragraphIndex + 1} of {paragraphs.length}
                </span>
                {speech.supported && block.sentences.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      speech.playSentences(
                        sentences.map((s) => s.text),
                        block.sentences[0].index,
                      )
                    }
                    className="inline-flex items-center gap-1 font-semibold hover:underline"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden />
                    Read paragraph
                  </button>
                )}
              </div>
              <p className={alignClass}>
                {block.sentences.map((sent) => {
                  const isSpoken =
                    speech.speaking &&
                    speech.activeSpeechMode === 'passage' &&
                    speech.currentSentenceIndex === sent.index;
                  const isActive =
                    isSpoken ||
                    (isSentenceFocusMode && activeHighlightIndex === sent.index);
                  return (
                    <span
                      key={sent.index}
                      ref={(el) => {
                        sentenceRefs.current[sent.index] = el;
                      }}
                      onClick={() => handleSentenceClick(sent.index)}
                      className={`rounded-md px-1 py-0.5 transition-colors ${
                        isActive ? tokens.highlightSentence : ''
                      }`}
                    >
                      <RenderSentenceText
                        text={sent.text}
                        bionic={settings.bionicReading}
                        punctuationFocus={settings.punctuationFocus}
                        mirrorLetterAlert={settings.mirrorLetterAlert}
                        englishSyllables={settings.englishSyllables}
                        tamilSyllableGrouping={settings.tamilSyllableGrouping}
                        tamilVowelHighlight={settings.tamilVowelHighlight}
                        karaokeMode={isKaraokeMode}
                        isSpokenSentence={isSpoken}
                        activeWordIndex={isSpoken ? activeSpokenWordIndex : null}
                        dark={dark}
                        onWordClick={(charStart) =>
                          handleWordClick(sent.index, charStart)
                        }
                        activeWordRef={setActiveWordElRef}
                      />{' '}
                    </span>
                  );
                })}
              </p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className={alignClass}>
        {blocks.map((block) => (
          <p
            key={block.paragraphIndex}
            style={{ marginBottom: `${settings.paragraphSpacing}em` }}
            className="last:mb-0"
          >
            {block.sentences.map((sent) => {
              const isSpoken =
                speech.speaking &&
                speech.activeSpeechMode === 'passage' &&
                speech.currentSentenceIndex === sent.index;
              const isSelected = activeHighlightIndex === sent.index;
              const useWordKaraoke =
                isKaraokeMode &&
                isSpoken &&
                speech.wordSyncStatus === 'supported';
              const isHighlighted =
                (!useWordKaraoke && isSpoken) ||
                (isSentenceFocusMode && isSelected);
              const isDimmed =
                isSentenceFocusMode && !isHighlighted && !isSpoken;

              return (
                <span
                  key={sent.index}
                  ref={(el) => {
                    sentenceRefs.current[sent.index] = el;
                  }}
                  onClick={() => handleSentenceClick(sent.index)}
                  className={`rounded-md px-1 py-0.5 transition-all ${
                    isSentenceFocusMode ? 'cursor-pointer' : ''
                  } ${
                    isHighlighted
                      ? tokens.highlightSentence
                      : useWordKaraoke
                        ? dark
                          ? 'bg-white/5'
                          : 'bg-teal-500/10'
                        : isSentenceFocusMode && isSelected
                          ? dark
                            ? 'bg-white/10'
                            : 'bg-teal-600/10'
                          : ''
                  } ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
                >
                  <RenderSentenceText
                    text={sent.text}
                    bionic={settings.bionicReading}
                    punctuationFocus={settings.punctuationFocus}
                    mirrorLetterAlert={settings.mirrorLetterAlert}
                    englishSyllables={settings.englishSyllables}
                    tamilSyllableGrouping={settings.tamilSyllableGrouping}
                    tamilVowelHighlight={settings.tamilVowelHighlight}
                    karaokeMode={isKaraokeMode}
                    isSpokenSentence={isSpoken}
                    activeWordIndex={isSpoken ? activeSpokenWordIndex : null}
                    dark={dark}
                    onWordClick={(charStart) =>
                      handleWordClick(sent.index, charStart)
                    }
                    activeWordRef={setActiveWordElRef}
                  />{' '}
                </span>
              );
            })}
          </p>
        ))}
      </div>
    );
  };

  if (sentences.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className={`text-2xl font-bold ${tokens.text}`}>
          No reading text loaded yet
        </h1>
        <p className={`text-sm ${tokens.subtext}`}>
          Paste text on Home, scan an image with OCR, or pick a passage from My
          Library.
        </p>
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white hover:bg-teal-500"
        >
          <Home className="h-4 w-4" aria-hidden />
          Go to Home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Studio Toolbar (compact & minimal in Focus Mode) */}
      {isFocusMode ? (
        <div
          className={`sticky top-3 z-30 mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 shadow-md backdrop-blur ${tokens.panelBg} ${tokens.border}`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('comfortable')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 min-h-[38px] text-xs font-bold text-white hover:bg-teal-500"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              Exit Focus Mode
            </button>
            {speech.supported && (
              <button
                type="button"
                onClick={() => {
                  if (speech.speaking && !speech.paused) speech.pause();
                  else if (speech.speaking && speech.paused) speech.resume();
                  else
                    speech.playSentences(
                      sentences.map((s) => s.text),
                      activeHighlightIndex,
                    );
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[38px] text-xs font-semibold ${tokens.secondaryBtn}`}
              >
                {speech.speaking && !speech.paused ? (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    {speech.speaking && speech.paused ? 'Resume' : 'Read aloud'}
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onSettingsChange({ rulerEnabled: !settings.rulerEnabled })
              }
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[38px] text-xs font-semibold ${
                rulerActive
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : tokens.secondaryBtn
              }`}
            >
              <Ruler className="h-3.5 w-3.5" aria-hidden />
              Ruler
            </button>
            <button
              type="button"
              onClick={() =>
                onSettingsChange({ bionicReading: !settings.bionicReading })
              }
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[38px] text-xs font-semibold ${
                settings.bionicReading
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : tokens.secondaryBtn
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Bionic
            </button>
            <button
              type="button"
              onClick={() =>
                onSettingsChange({
                  punctuationFocus: !settings.punctuationFocus,
                })
              }
              aria-pressed={settings.punctuationFocus}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[38px] text-xs font-semibold ${
                settings.punctuationFocus
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : tokens.secondaryBtn
              }`}
            >
              Punctuation Focus
            </button>
            <button
              type="button"
              onClick={() => setShowFocusSidebar((s) => !s)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[38px] text-xs font-semibold ${tokens.secondaryBtn}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {showFocusSidebar ? 'Hide controls' : 'Controls'}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-2xl border p-3 sm:p-4 space-y-3 ${tokens.panelBg} ${tokens.border}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Reading mode selector */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Reading modes"
            >
              {READING_MODES.map((m) => {
                const active = settings.readingMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleModeChange(m.id)}
                    title={m.description}
                    className={`rounded-xl border px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : tokens.secondaryBtn
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Quick action toggles */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({ bionicReading: !settings.bionicReading })
                }
                aria-pressed={settings.bionicReading}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 min-h-[36px] text-xs font-semibold whitespace-nowrap ${
                  settings.bionicReading
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : tokens.secondaryBtn
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Bionic
              </button>

              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    punctuationFocus: !settings.punctuationFocus,
                  })
                }
                aria-pressed={settings.punctuationFocus}
                title="Highlight punctuation marks and add gentle pauses at sentence boundaries (P)"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 min-h-[36px] text-xs font-semibold whitespace-nowrap ${
                  settings.punctuationFocus
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : tokens.secondaryBtn
                }`}
              >
                Punctuation Focus
              </button>

              <button
                type="button"
                onClick={() =>
                  onSettingsChange({ rulerEnabled: !settings.rulerEnabled })
                }
                aria-pressed={rulerActive}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 min-h-[36px] text-xs font-semibold whitespace-nowrap ${
                  rulerActive
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : tokens.secondaryBtn
                }`}
              >
                <Ruler className="h-3.5 w-3.5" aria-hidden />
                Ruler
              </button>

              <button
                type="button"
                onClick={onSaveToLibrary}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 min-h-[36px] text-xs font-semibold whitespace-nowrap ${tokens.secondaryBtn}`}
              >
                <BookmarkCheck className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                Save
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('focus')}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 min-h-[36px] text-xs font-semibold whitespace-nowrap ${tokens.secondaryBtn}`}
                title="Enter distraction-free Focus Mode (F)"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                Focus
              </button>
            </div>
          </div>

          {savedNotice && (
            <p
              role="status"
              className={`text-xs font-semibold ${dark ? 'text-teal-300' : 'text-teal-700'}`}
            >
              {savedNotice}
            </p>
          )}
        </div>
      )}

      {/* Main Two-Zone Studio Grid */}
      <div
        className={
          isFocusMode && !showFocusSidebar
            ? 'mx-auto max-w-4xl'
            : 'grid gap-6 lg:grid-cols-12 items-start'
        }
      >
        {/* Reading Pane */}
        <div
          className={
            isFocusMode && !showFocusSidebar ? 'w-full' : 'lg:col-span-8'
          }
        >
          {/* Karaoke Reading bar */}
          {isKaraokeMode && (
            <div
              className={`mb-3 rounded-2xl border p-3.5 sm:p-4 space-y-2.5 text-xs ${tokens.panelBg} ${tokens.border}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-bold text-sm ${tokens.text}`}>
                    <Volume2 className="inline h-4 w-4 mr-1.5 text-teal-600" aria-hidden />
                    Karaoke Reading
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      speech.wordSyncStatus === 'supported'
                        ? 'bg-teal-600/15 text-teal-700 dark:text-teal-300'
                        : speech.wordSyncStatus === 'unsupported'
                          ? 'bg-amber-400/20 text-amber-800 dark:text-amber-300'
                          : dark
                            ? 'bg-[#0F1B2E] text-[#B8C5D9]'
                            : 'bg-cream-100 text-navy-700'
                    }`}
                  >
                    {!speech.supported
                      ? 'Speech synthesis unavailable in this browser'
                      : speech.wordSyncStatus === 'supported'
                        ? 'Word sync active'
                        : speech.wordSyncStatus === 'unsupported'
                          ? 'Sentence-level fallback (word events unsupported by voice/browser)'
                          : speech.wordSyncStatus === 'pending'
                            ? 'Checking word boundary support…'
                            : 'Click Play or tap any word to begin'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {speech.supported && (
                    <>
                      {speech.speaking && !speech.paused ? (
                        <button
                          type="button"
                          onClick={speech.pause}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 min-h-[36px] font-semibold text-white hover:bg-teal-500"
                        >
                          <Pause className="h-3.5 w-3.5" aria-hidden />
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={
                            speech.speaking && speech.paused
                              ? speech.resume
                              : () =>
                                  speech.playSentences(
                                    sentenceTexts,
                                    activeHighlightIndex,
                                  )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 min-h-[36px] font-semibold text-white hover:bg-teal-500"
                        >
                          <Play className="h-3.5 w-3.5" aria-hidden />
                          {speech.speaking && speech.paused ? 'Resume' : 'Play'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={speech.stop}
                        disabled={!speech.speaking}
                        className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 min-h-[36px] font-semibold disabled:opacity-40 ${tokens.secondaryBtn}`}
                      >
                        <Square className="h-3 w-3" aria-hidden />
                        Stop
                      </button>

                      <label className="inline-flex items-center gap-1.5 ml-1">
                        <span className={`font-semibold ${tokens.subtext}`}>
                          Speed
                        </span>
                        <select
                          aria-label="Karaoke reading speed"
                          value={speech.rate}
                          onChange={(e) =>
                            speech.setRate(parseFloat(e.target.value))
                          }
                          className={`rounded-lg border px-2 py-1 min-h-[34px] text-xs font-semibold tabular-nums ${tokens.input}`}
                        >
                          {[0.6, 0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6, 1.8, 2].map(
                            (r) => (
                              <option key={r} value={r}>
                                {r.toFixed(1)}x
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {speech.voiceWarning && (
                <p className="text-xs font-medium text-coral-600">
                  {speech.voiceWarning}
                </p>
              )}
            </div>
          )}

          {/* Punctuation Focus notice & optional legend */}
          {settings.punctuationFocus && (
            <div
              className={`mb-3 rounded-2xl border px-3.5 py-2.5 text-xs space-y-2.5 ${tokens.panelBg} ${tokens.border}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-bold ${tokens.text}`}>
                    Punctuation Focus
                  </span>
                  <span className={tokens.subtext}>
                    {speech.speaking &&
                    speech.activeSpeechMode === 'passage' &&
                    speech.currentSentenceIndex !== null
                      ? (detectSentenceEndPunctuation(
                          sentences[speech.currentSentenceIndex]?.text ?? '',
                        )?.label ?? 'Reading with sentence boundary pauses')
                      : 'Highlighting marks & adding Read Aloud boundary pauses'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPunctLegend((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold ${tokens.secondaryBtn}`}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                  {showPunctLegend ? 'Hide legend' : 'Show legend'}
                </button>
              </div>

              {showPunctLegend && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-current/10">
                  {PUNCTUATION_LEGEND_ITEMS.map((item) => (
                    <div
                      key={item.name}
                      className={`rounded-xl border px-2.5 py-1.5 flex items-start gap-2 ${tokens.cardBg} ${tokens.border}`}
                    >
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold shrink-0 ${getPunctuationStyle(item.kind, dark)}`}
                      >
                        {item.symbol}
                      </span>
                      <div className="min-w-0">
                        <p className={`font-semibold leading-tight ${tokens.text}`}>
                          {item.name}
                        </p>
                        <p className={`text-[11px] leading-snug ${tokens.subtext}`}>
                          {item.purpose}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sentence Focus navigation bar */}
          {isSentenceFocusMode && (
            <div
              className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-xs ${tokens.panelBg} ${tokens.border}`}
            >
              <span className={`font-semibold tabular-nums ${tokens.text}`}>
                <Eye className="inline h-3.5 w-3.5 mr-1.5 text-teal-600" />
                Sentence {activeHighlightIndex + 1} of {sentences.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSentenceIndex((i) => Math.max(0, i - 1))
                  }
                  disabled={activeHighlightIndex <= 0}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold disabled:opacity-40 ${tokens.secondaryBtn}`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSentenceIndex((i) =>
                      Math.min(sentences.length - 1, i + 1),
                    )
                  }
                  disabled={activeHighlightIndex >= sentences.length - 1}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold disabled:opacity-40 ${tokens.secondaryBtn}`}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}

          {/* Chunk Reading navigation & progress bar */}
          {isChunkMode && chunks.length > 0 && (
            <div
              className={`mb-3 rounded-2xl border p-4 space-y-3 ${tokens.panelBg} ${tokens.border}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={`text-sm font-bold tabular-nums ${tokens.text}`}>
                    Chunk {chunkIndex + 1} of {chunks.length}
                  </p>
                  <p className={`text-xs tabular-nums ${tokens.subtext}`}>
                    Sentences {currentChunk.startSentence + 1}–
                    {currentChunk.endSentence + 1} · {currentChunk.wordCount}{' '}
                    words
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChunkIndex((c) => Math.max(0, c - 1))}
                    disabled={chunkIndex <= 0}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3.5 py-2 min-h-[38px] text-xs font-semibold disabled:opacity-40 ${tokens.secondaryBtn}`}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setChunkIndex((c) => Math.min(chunks.length - 1, c + 1))
                    }
                    disabled={chunkIndex >= chunks.length - 1}
                    className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3.5 py-2 min-h-[38px] text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
              <div
                className={`h-2 rounded-full overflow-hidden ${dark ? 'bg-[#0F1B2E]' : 'bg-cream-200'}`}
                role="progressbar"
                aria-valuenow={Math.round(((chunkIndex + 1) / chunks.length) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-teal-600 transition-[width] duration-200"
                  style={{
                    width: `${Math.round(((chunkIndex + 1) / chunks.length) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Reading Surface (with optional Side-by-Side Bilingual Split & Reading Ruler) */}
          <ReadingRuler
            enabled={rulerActive}
            height={settings.rulerHeight}
            color={settings.rulerColor}
            opacity={settings.rulerOpacity}
            focusArea={settings.rulerFocusArea}
            dark={dark}
            onDisable={() =>
              onSettingsChange({
                rulerEnabled: false,
                readingMode:
                  settings.readingMode === 'line-focus'
                    ? 'comfortable'
                    : settings.readingMode,
              })
            }
          >
            <article
              aria-label="Reading passage"
              style={{
                ...tokens.textStyles,
                paddingLeft: `${Math.max(16, settings.marginX)}px`,
                paddingRight: `${Math.max(16, settings.marginX)}px`,
              }}
              className={`rounded-3xl border py-8 sm:py-10 shadow-sm transition-colors ${tokens.border}`}
            >
              <div
                style={{
                  fontFamily: `"${settings.fontFamily}", "Atkinson Hyperlegible", "Noto Sans Tamil", "Noto Sans Devanagari", "Noto Sans Telugu", "Noto Sans Malayalam", "Noto Sans Kannada", Georgia, serif`,
                  fontSize: `${settings.fontSize}px`,
                  letterSpacing: `${settings.letterSpacing}px`,
                  wordSpacing: `${settings.wordSpacing}px`,
                  lineHeight: settings.lineHeight,
                }}
                className={`${widthClass} mx-auto`}
              >
                {renderParagraphBlocks(visibleParagraphs)}
              </div>
            </article>
          </ReadingRuler>
        </div>

        {/* Customization & Speech Sidebar */}
        {(!isFocusMode || showFocusSidebar) && (
          <aside
            className="lg:col-span-4 space-y-4 lg:sticky lg:top-20"
            aria-label="Reading studio controls"
          >
            {/* Sidebar tabs */}
            <div
              className={`grid grid-cols-5 gap-1 rounded-2xl border p-1 ${tokens.panelBg} ${tokens.border}`}
              role="tablist"
              aria-label="Customization categories"
            >
              {(
                [
                  ['typography', 'Type'],
                  ['themes', 'Themes'],
                  ['aids', 'Ruler'],
                  ['tools', 'Tools'],
                  ['speech', 'Speech'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === id}
                  onClick={() => setSidebarTab(id)}
                  className={`rounded-xl py-2 min-h-[38px] text-xs font-semibold transition-colors ${
                    sidebarTab === id
                      ? 'bg-teal-600 text-white'
                      : dark
                        ? 'text-[#B8C5D9] hover:text-white'
                        : 'text-navy-700 hover:text-navy-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {sidebarTab === 'typography' && (
              <div
                className={`rounded-2xl border p-5 space-y-4 ${tokens.panelBg} ${tokens.border}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className={`font-bold ${tokens.text}`}>
                    Type & Spacing
                  </h2>
                  <button
                    type="button"
                    onClick={onReset}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      dark
                        ? 'text-[#E3ECF7] hover:bg-[#1E3352]'
                        : 'text-navy-700 hover:bg-cream-200/70'
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Reset
                  </button>
                </div>

                <label className="block">
                  <span
                    className={`mb-1.5 block text-sm font-medium ${dark ? 'text-[#E3ECF7]' : 'text-navy-700'}`}
                  >
                    Font
                  </span>
                  <select
                    value={settings.fontFamily}
                    onChange={(e) =>
                      onSettingsChange({ fontFamily: e.target.value })
                    }
                    className={`w-full rounded-xl border px-3 py-2 text-sm min-h-[40px] ${tokens.input}`}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>

                <SliderControl
                  label="Font size"
                  value={settings.fontSize}
                  min={LIMITS.fontSize.min}
                  max={LIMITS.fontSize.max}
                  step={LIMITS.fontSize.step}
                  onChange={(v) => onSettingsChange({ fontSize: v })}
                  format={(v) => `${v}px`}
                  dark={dark}
                />
                <SliderControl
                  label="Letter spacing"
                  value={settings.letterSpacing}
                  min={LIMITS.letterSpacing.min}
                  max={LIMITS.letterSpacing.max}
                  step={LIMITS.letterSpacing.step}
                  onChange={(v) => onSettingsChange({ letterSpacing: v })}
                  format={(v) => `${v}px`}
                  dark={dark}
                />
                <SliderControl
                  label="Word spacing"
                  value={settings.wordSpacing}
                  min={LIMITS.wordSpacing.min}
                  max={LIMITS.wordSpacing.max}
                  step={LIMITS.wordSpacing.step}
                  onChange={(v) => onSettingsChange({ wordSpacing: v })}
                  format={(v) => `${v}px`}
                  dark={dark}
                />
                <SliderControl
                  label="Line spacing"
                  value={settings.lineHeight}
                  min={LIMITS.lineHeight.min}
                  max={LIMITS.lineHeight.max}
                  step={LIMITS.lineHeight.step}
                  onChange={(v) => onSettingsChange({ lineHeight: v })}
                  format={(v) => `${v.toFixed(1)}x`}
                  dark={dark}
                />
                <SliderControl
                  label="Paragraph spacing"
                  value={settings.paragraphSpacing}
                  min={LIMITS.paragraphSpacing.min}
                  max={LIMITS.paragraphSpacing.max}
                  step={LIMITS.paragraphSpacing.step}
                  onChange={(v) => onSettingsChange({ paragraphSpacing: v })}
                  format={(v) => `${v.toFixed(1)}em`}
                  dark={dark}
                />
                <SliderControl
                  label="Side margins"
                  value={settings.marginX}
                  min={LIMITS.marginX.min}
                  max={LIMITS.marginX.max}
                  step={LIMITS.marginX.step}
                  onChange={(v) => onSettingsChange({ marginX: v })}
                  format={(v) => `${v}px`}
                  dark={dark}
                />

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span
                      className={`mb-1 block text-xs font-medium ${tokens.subtext}`}
                    >
                      Reading width
                    </span>
                    <select
                      value={settings.readingWidth}
                      onChange={(e) =>
                        onSettingsChange({
                          readingWidth: e.target.value as ReadingWidth,
                        })
                      }
                      className={`w-full rounded-xl border px-2.5 py-2 text-xs min-h-[38px] ${tokens.input}`}
                    >
                      <option value="narrow">Narrow</option>
                      <option value="medium">Medium</option>
                      <option value="wide">Wide</option>
                      <option value="full">Full</option>
                    </select>
                  </label>
                  <label className="block">
                    <span
                      className={`mb-1 block text-xs font-medium ${tokens.subtext}`}
                    >
                      Alignment
                    </span>
                    <select
                      value={settings.textAlign}
                      onChange={(e) =>
                        onSettingsChange({
                          textAlign: e.target.value as TextAlignment,
                        })
                      }
                      className={`w-full rounded-xl border px-2.5 py-2 text-xs min-h-[38px] ${tokens.input}`}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="justify">Justify</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {sidebarTab === 'themes' && (
              <div
                className={`rounded-2xl border p-5 space-y-4 ${tokens.panelBg} ${tokens.border}`}
              >
                <h2 className={`font-bold ${tokens.text}`}>
                  Background & Color Presets
                </h2>
                <div
                  role="radiogroup"
                  aria-label="Background theme"
                  className="grid grid-cols-2 gap-2"
                >
                  {THEME_PRESETS.map((preset) => {
                    const selected = settings.theme === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          onSettingsChange({
                            theme: preset.id,
                            customBgColor: null,
                            customTextColor: null,
                          })
                        }
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 min-h-[42px] text-xs font-semibold ${
                          selected
                            ? 'border-teal-500 ring-2 ring-teal-500/35'
                            : tokens.border
                        }`}
                        style={{
                          backgroundColor: preset.swatchBg,
                          color: preset.swatchText,
                        }}
                      >
                        <span
                          className="h-3 w-3 rounded-full border border-current shrink-0"
                          aria-hidden
                        />
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-current/10">
                  <label className="block">
                    <span className={`block text-xs font-medium mb-1 ${tokens.subtext}`}>
                      Text color
                    </span>
                    <input
                      type="color"
                      value={settings.customTextColor || tokens.inkHex}
                      onChange={(e) =>
                        onSettingsChange({ customTextColor: e.target.value })
                      }
                      className="h-10 w-full rounded-xl border border-cream-200 cursor-pointer bg-transparent"
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-xs font-medium mb-1 ${tokens.subtext}`}>
                      Page color
                    </span>
                    <input
                      type="color"
                      value={settings.customBgColor || tokens.paperHex}
                      onChange={(e) =>
                        onSettingsChange({ customBgColor: e.target.value })
                      }
                      className="h-10 w-full rounded-xl border border-cream-200 cursor-pointer bg-transparent"
                    />
                  </label>
                </div>

                {(settings.customBgColor || settings.customTextColor) && (
                  <button
                    type="button"
                    onClick={() =>
                      onSettingsChange({
                        customBgColor: null,
                        customTextColor: null,
                      })
                    }
                    className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold ${tokens.secondaryBtn}`}
                  >
                    Reset custom colors to theme preset
                  </button>
                )}
              </div>
            )}

            {sidebarTab === 'aids' && (
              <div
                className={`rounded-2xl border p-5 space-y-4 ${tokens.panelBg} ${tokens.border}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className={`font-bold ${tokens.text}`}>
                    Reading Ruler & Chunks
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      onSettingsChange({ rulerEnabled: !rulerActive })
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      rulerActive
                        ? 'bg-teal-600 text-white'
                        : tokens.secondaryBtn
                    }`}
                  >
                    {rulerActive ? 'Ruler On' : 'Ruler Off'}
                  </button>
                </div>

                <SliderControl
                  label="Ruler height"
                  value={settings.rulerHeight}
                  min={LIMITS.rulerHeight.min}
                  max={LIMITS.rulerHeight.max}
                  step={LIMITS.rulerHeight.step}
                  onChange={(v) => onSettingsChange({ rulerHeight: v })}
                  format={(v) => `${v}px`}
                  dark={dark}
                />

                <SliderControl
                  label="Mask dim opacity"
                  value={settings.rulerOpacity}
                  min={LIMITS.rulerOpacity.min}
                  max={LIMITS.rulerOpacity.max}
                  step={LIMITS.rulerOpacity.step}
                  onChange={(v) => onSettingsChange({ rulerOpacity: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                  dark={dark}
                />

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={`block text-xs font-medium mb-1 ${tokens.subtext}`}>
                      Ruler color
                    </span>
                    <select
                      value={settings.rulerColor}
                      onChange={(e) =>
                        onSettingsChange({
                          rulerColor: e.target.value as RulerColor,
                        })
                      }
                      className={`w-full rounded-xl border px-2.5 py-2 text-xs min-h-[38px] ${tokens.input}`}
                    >
                      <option value="teal">Teal</option>
                      <option value="amber">Warm Amber</option>
                      <option value="blue">Soft Blue</option>
                      <option value="rose">Coral Rose</option>
                      <option value="neutral">Neutral</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={`block text-xs font-medium mb-1 ${tokens.subtext}`}>
                      Focus area
                    </span>
                    <select
                      value={settings.rulerFocusArea}
                      onChange={(e) =>
                        onSettingsChange({
                          rulerFocusArea: e.target.value as RulerFocusArea,
                        })
                      }
                      className={`w-full rounded-xl border px-2.5 py-2 text-xs min-h-[38px] ${tokens.input}`}
                    >
                      <option value="narrow">Narrow</option>
                      <option value="medium">Medium</option>
                      <option value="wide">Wide</option>
                    </select>
                  </label>
                </div>

                <div className="pt-2 border-t border-current/10 space-y-3">
                  <SliderControl
                    label="Chunk reading size"
                    value={settings.chunkSize}
                    min={LIMITS.chunkSize.min}
                    max={LIMITS.chunkSize.max}
                    step={LIMITS.chunkSize.step}
                    onChange={(v) => onSettingsChange({ chunkSize: v })}
                    format={(v) => `${v} sentences`}
                    dark={dark}
                  />
                  <p className={`text-xs ${tokens.subtext}`}>
                    Tip: Selecting, copying, or scrolling text will never trigger Read Aloud accidentally. Use Speech controls or Karaoke word clicks when ready to listen.
                  </p>
                </div>
              </div>
            )}

            {sidebarTab === 'tools' && (
              <div className="space-y-4">
                {/* English Reading Aids & Word Structure */}
                <section
                  aria-label="English reading aids"
                  className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 ${tokens.panelBg} ${tokens.border}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className={`font-bold text-sm flex items-center gap-1.5 ${tokens.text}`}>
                      <BookOpenText className="h-4 w-4 text-teal-600" aria-hidden />
                      English Reading Aids
                    </h2>
                  </div>

                  {/* Mirror Letter Alert */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={settings.mirrorLetterAlert}
                          onChange={(e) =>
                            onSettingsChange({ mirrorLetterAlert: e.target.checked })
                          }
                          className="h-4 w-4 accent-teal-600"
                        />
                        <span className={tokens.text}>
                          Mirror Letter Alert (b/d · p/q · m/w)
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowMirrorHint((v) => !v)}
                        className={`text-[11px] font-semibold hover:underline ${tokens.subtext}`}
                      >
                        {showMirrorHint ? 'Hide key' : 'Color key'}
                      </button>
                    </div>
                    {showMirrorHint && (
                      <div className={`rounded-xl border p-2.5 text-[11px] space-y-1.5 ${tokens.cardBg} ${tokens.border}`}>
                        <p className={tokens.subtext}>
                          Subtle color cues distinguish similar-looking English letter shapes without changing spelling:
                        </p>
                        <div className="flex flex-wrap gap-2 font-mono text-xs font-bold">
                          <span className={getMirrorLetterStyle('b', dark)}>b</span>
                          <span className={getMirrorLetterStyle('d', dark)}>d</span>
                          <span className="opacity-40">·</span>
                          <span className={getMirrorLetterStyle('p', dark)}>p</span>
                          <span className={getMirrorLetterStyle('q', dark)}>q</span>
                          <span className="opacity-40">·</span>
                          <span className={getMirrorLetterStyle('m', dark)}>m</span>
                          <span className={getMirrorLetterStyle('w', dark)}>w</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* English Syllable Reading */}
                  <label className="flex items-start gap-2 cursor-pointer text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={settings.englishSyllables}
                      onChange={(e) =>
                        onSettingsChange({ englishSyllables: e.target.checked })
                      }
                      className="h-4 w-4 accent-teal-600 mt-0.5"
                    />
                    <span className={tokens.text}>
                      English Syllable Reading Mode
                      <span className={`block font-normal text-[11px] ${tokens.subtext}`}>
                        Visually separates syllables in multi-syllable English words (English only).
                      </span>
                    </span>
                  </label>

                  {/* English Prefix / Root / Suffix Explorer */}
                  <div className="pt-2 border-t border-current/10 space-y-2.5">
                    <p className={`text-xs font-bold ${tokens.text}`}>
                      Prefix / Root / Suffix Explorer
                    </p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={morphWordInput}
                        onChange={(e) => setMorphWordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && morphWordInput.trim()) {
                            e.preventDefault();
                            void runEnglishMorphology(morphWordInput, false);
                          }
                        }}
                        placeholder="Type English word (e.g. unhappiness)…"
                        className={`flex-1 min-w-0 rounded-xl border px-2.5 py-1.5 text-xs min-h-[36px] ${tokens.input}`}
                      />
                      <button
                        type="button"
                        onClick={() => void runEnglishMorphology(morphWordInput, false)}
                        disabled={!morphWordInput.trim() || morphLoading}
                        className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap ${tokens.secondaryBtn}`}
                      >
                        Offline
                      </button>
                      <button
                        type="button"
                        onClick={() => void runEnglishMorphology(morphWordInput, true)}
                        disabled={!morphWordInput.trim() || morphLoading}
                        className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-500 disabled:opacity-45 whitespace-nowrap"
                      >
                        {morphLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        AI
                      </button>
                    </div>

                    {englishPassageWords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {englishPassageWords.slice(0, 6).map((item) => (
                          <button
                            key={item.word}
                            type="button"
                            onClick={() => void runEnglishMorphology(item.word, true)}
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${tokens.secondaryBtn}`}
                          >
                            {item.word}
                          </button>
                        ))}
                      </div>
                    )}

                    {morphError && (
                      <p className="text-[11px] font-medium text-coral-600">{morphError}</p>
                    )}

                    {morphResult && (
                      <div className={`rounded-xl border p-3 text-xs space-y-2 ${tokens.cardBg} ${tokens.border}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${tokens.text}`}>{morphResult.word}</span>
                          <span className={`text-[10px] font-semibold ${tokens.subtext}`}>
                            {morphResult.provider === 'gemini' ? 'Gemini AI' : 'Offline rule-based'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                          <div className={`rounded-lg border p-1.5 ${tokens.border}`}>
                            <p className={`font-semibold ${tokens.subtext}`}>Prefix</p>
                            <p className={`font-bold ${tokens.text}`}>{morphResult.prefix || '—'}</p>
                            {morphResult.prefixMeaning && (
                              <p className={tokens.subtext}>{morphResult.prefixMeaning}</p>
                            )}
                          </div>
                          <div className={`rounded-lg border p-1.5 ${tokens.border}`}>
                            <p className={`font-semibold ${tokens.subtext}`}>Root</p>
                            <p className={`font-bold ${tokens.text}`}>{morphResult.root || '—'}</p>
                            {morphResult.rootMeaning && (
                              <p className={tokens.subtext}>{morphResult.rootMeaning}</p>
                            )}
                          </div>
                          <div className={`rounded-lg border p-1.5 ${tokens.border}`}>
                            <p className={`font-semibold ${tokens.subtext}`}>Suffix</p>
                            <p className={`font-bold ${tokens.text}`}>{morphResult.suffix || '—'}</p>
                            {morphResult.suffixMeaning && (
                              <p className={tokens.subtext}>{morphResult.suffixMeaning}</p>
                            )}
                          </div>
                        </div>
                        <p className={tokens.text}>{morphResult.howMeaningChanges}</p>
                        {(morphResult.uncertain || morphResult.note) && (
                          <p className={`text-[11px] ${tokens.subtext}`}>{morphResult.note}</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* Dedicated Tamil Reading Tools Section */}
                <section
                  aria-label="Tamil Reading Tools"
                  className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 ${tokens.panelBg} ${tokens.border}`}
                >
                  <div>
                    <h2 className={`font-bold text-sm font-indic ${tokens.text}`}>
                      Tamil Reading Tools (தமிழ் வாசிப்பு கருவிகள்)
                    </h2>
                    <p className={`text-[11px] mt-0.5 ${tokens.subtext}`}>
                      Grapheme-safe Tamil tools that keep உயிர்மெய் letters &amp; vowel signs intact.
                    </p>
                  </div>

                  {/* Tamil Sound / Syllable Grouping */}
                  <label className="flex items-start gap-2 cursor-pointer text-xs font-semibold font-indic">
                    <input
                      type="checkbox"
                      checked={settings.tamilSyllableGrouping}
                      onChange={(e) =>
                        onSettingsChange({ tamilSyllableGrouping: e.target.checked })
                      }
                      className="h-4 w-4 accent-teal-600 mt-0.5"
                    />
                    <span className={tokens.text}>
                      Tamil Sound Grouping (தமிழ் அசைப் பிரிப்பு)
                      <span className={`block font-normal text-[11px] ${tokens.subtext}`}>
                        Groups intact உயிர் / உயிர்மெய் + ஒற்று (்) units without breaking vowel signs.
                      </span>
                    </span>
                  </label>

                  {/* Tamil Vowel Marker Highlighting */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2 cursor-pointer text-xs font-semibold font-indic">
                        <input
                          type="checkbox"
                          checked={settings.tamilVowelHighlight}
                          onChange={(e) =>
                            onSettingsChange({ tamilVowelHighlight: e.target.checked })
                          }
                          className="h-4 w-4 accent-teal-600 mt-0.5"
                        />
                        <span className={tokens.text}>
                          Tamil Vowel Marker Highlight (உயிர்மெய்)
                          <span className={`block font-normal text-[11px] ${tokens.subtext}`}>
                            Highlights whole letters carrying ா, ி, ீ, ு, ூ, ெ, ே, ை, ொ, ோ, ௌ.
                          </span>
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowTamilVowelLegend((v) => !v)}
                        className={`text-[11px] font-semibold shrink-0 hover:underline ${tokens.subtext}`}
                      >
                        {showTamilVowelLegend ? 'Hide' : 'Legend'}
                      </button>
                    </div>

                    {showTamilVowelLegend && (
                      <div className={`rounded-xl border p-2.5 space-y-1.5 text-[11px] font-indic ${tokens.cardBg} ${tokens.border}`}>
                        {TAMIL_VOWEL_LEGEND.map((item) => (
                          <div key={item.nameTa} className="flex items-center justify-between gap-2">
                            <span className={`font-bold text-xs ${getTamilVowelStyle(item.kind, dark)}`}>
                              {item.sample}
                            </span>
                            <span className={tokens.subtext}>
                              {item.nameTa} ({item.markers})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tamil Compound Word Splitter (சந்தி பிரித்தல்) */}
                  <div className="pt-2 border-t border-current/10 space-y-2.5">
                    <p className={`text-xs font-bold font-indic ${tokens.text}`}>
                      Tamil Compound Word Splitter (சந்தி பிரித்தல்)
                    </p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={sandhiWordInput}
                        onChange={(e) => setSandhiWordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && sandhiWordInput.trim()) {
                            e.preventDefault();
                            void runTamilSandhi(sandhiWordInput, true);
                          }
                        }}
                        placeholder="தமிழ் சொல் (எ.கா. பள்ளிக்கூடம்)…"
                        className={`flex-1 min-w-0 rounded-xl border px-2.5 py-1.5 text-xs min-h-[36px] font-indic ${tokens.input}`}
                      />
                      <button
                        type="button"
                        onClick={() => void runTamilSandhi(sandhiWordInput, false)}
                        disabled={!sandhiWordInput.trim() || sandhiLoading}
                        className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap ${tokens.secondaryBtn}`}
                      >
                        Offline
                      </button>
                      <button
                        type="button"
                        onClick={() => void runTamilSandhi(sandhiWordInput, true)}
                        disabled={!sandhiWordInput.trim() || sandhiLoading}
                        className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-500 disabled:opacity-45 whitespace-nowrap"
                      >
                        {sandhiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        AI
                      </button>
                    </div>

                    {tamilPassageWords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tamilPassageWords.slice(0, 6).map((item) => (
                          <button
                            key={item.word}
                            type="button"
                            onClick={() => void runTamilSandhi(item.word, true)}
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium font-indic ${tokens.secondaryBtn}`}
                          >
                            {item.word}
                          </button>
                        ))}
                      </div>
                    )}

                    {sandhiError && (
                      <p className="text-[11px] font-medium text-coral-600 font-indic">
                        {sandhiError}
                      </p>
                    )}

                    {sandhiResult && (
                      <div className={`rounded-xl border p-3 text-xs space-y-2 font-indic ${tokens.cardBg} ${tokens.border}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold text-sm ${tokens.text}`}>{sandhiResult.word}</span>
                          <span className={`text-[10px] font-semibold ${tokens.subtext}`}>
                            {sandhiResult.provider === 'gemini' ? 'Gemini AI' : 'அடிப்படை (Offline)'}
                          </span>
                        </div>

                        {sandhiResult.components.length > 0 && (
                          <div className="space-y-1">
                            {sandhiResult.components.map((c, idx) => (
                              <div
                                key={idx}
                                className={`rounded-lg border px-2.5 py-1.5 flex items-start justify-between gap-2 ${tokens.border}`}
                              >
                                <div>
                                  <span className={`font-bold ${tokens.text}`}>{c.part}</span>
                                  <span className={`ml-1.5 text-[10px] ${tokens.subtext}`}>
                                    ({c.role})
                                  </span>
                                </div>
                                <span className={`text-[11px] text-right ${tokens.subtext}`}>
                                  {c.meaningTa}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3 text-[11px]">
                          {sandhiResult.root && (
                            <span className={tokens.text}>
                              <strong>வேர்:</strong> {sandhiResult.root}
                            </span>
                          )}
                          {sandhiResult.suffixes.length > 0 && (
                            <span className={tokens.text}>
                              <strong>விகுதி:</strong> {sandhiResult.suffixes.join(', ')}
                            </span>
                          )}
                        </div>

                        <p className={tokens.text}>{sandhiResult.overallMeaningTa}</p>

                        {(sandhiResult.uncertain || sandhiResult.note) && (
                          <p className={`text-[11px] ${tokens.subtext}`}>{sandhiResult.note}</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {sidebarTab === 'speech' && (
              <SpeechPanel
                text={text}
                sentences={sentences.map((s) => s.text)}
                activeSentenceIndex={activeHighlightIndex}
                speech={speech}
                dark={dark}
              />
            )}

            {/* Quick compact speech bar when user is on another tab */}
            {sidebarTab !== 'speech' && (
              <SpeechPanel
                text={text}
                sentences={sentences.map((s) => s.text)}
                activeSentenceIndex={activeHighlightIndex}
                speech={speech}
                dark={dark}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
