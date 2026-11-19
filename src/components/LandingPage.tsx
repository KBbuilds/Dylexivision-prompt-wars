import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Camera,
  FolderHeart,
  Pause,
  Play,
  Ruler,
  SlidersHorizontal,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { AppRoute } from '@/components/HomePage';
import { isTamilVoice } from '@/hooks/useSpeech';
import { COMING_SOON_LANGUAGES } from '@/lib/languages';

interface LandingPageProps {
  onGetStarted: (options?: { route?: AppRoute; sampleText?: string }) => void;
  reducedMotion: boolean;
}

const TAMIL_LINES = [
  ['தமிழில்', 'வாசிப்போம்'],
  ['மரம்', 'நமக்கு', 'நிழல்', 'தருகிறது.'],
  ['கல்வி', 'அனைவருக்கும்', 'கிடைக்க', 'வேண்டும்.'],
];

const TAMIL_WORDS = TAMIL_LINES.flatMap((words, lineIdx) =>
  words.map((word, wordIdx) => ({
    lineIdx,
    wordIdx,
    word,
    flatIdx:
      TAMIL_LINES.slice(0, lineIdx).reduce((sum, l) => sum + l.length, 0) +
      wordIdx,
  })),
);

const TAMIL_SAMPLE_PASSAGE =
  'தமிழில் வாசிப்போம்\n\nமரம் நமக்கு நிழல் தருகிறது.\n\nகல்வி அனைவருக்கும் கிடைக்க வேண்டும்.';

export function LandingPage({
  onGetStarted,
  reducedMotion,
}: LandingPageProps) {
  const [playing, setPlaying] = useState(!reducedMotion);
  const [activeWordIdx, setActiveWordIdx] = useState(3);
  const [speaking, setSpeaking] = useState(false);
  const [tamilSpeechNotice, setTamilSpeechNotice] = useState<string | null>(
    null,
  );
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveWordIdx((prev) => (prev + 1) % TAMIL_WORDS.length);
    }, 950);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion]);

  useEffect(() => {
    return () => {
      if (speakTimerRef.current !== null) {
        window.clearTimeout(speakTimerRef.current);
      }
      utterRef.current = null;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const currentWord = TAMIL_WORDS[activeWordIdx] ?? TAMIL_WORDS[0];

  const handleSpeakTamil = () => {
    setTamilSpeechNotice(null);
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setTamilSpeechNotice(
        'Browser speech synthesis is unavailable on this device.',
      );
      return;
    }
    const synth = window.speechSynthesis;
    if (speaking) {
      if (speakTimerRef.current !== null) {
        window.clearTimeout(speakTimerRef.current);
        speakTimerRef.current = null;
      }
      utterRef.current = null;
      synth.cancel();
      setSpeaking(false);
      return;
    }

    const voices = synth.getVoices();
    const tamilVoice =
      voices.find((v) => isTamilVoice(v) && v.lang.toLowerCase() === 'ta-in') ??
      voices.find(isTamilVoice) ??
      null;

    if (!tamilVoice) {
      synth.cancel();
      setSpeaking(false);
      setTamilSpeechNotice(
        'No Tamil (ta-IN) voice is available on this browser/device. Install a Tamil TTS voice in OS settings (or use Chrome/Edge) to hear Tamil read aloud.',
      );
      return;
    }

    synth.cancel();
    const utter = new SpeechSynthesisUtterance(
      'தமிழில் வாசிப்போம். மரம் நமக்கு நிழல் தருகிறது. கல்வி அனைவருக்கும் கிடைக்க வேண்டும்.',
    );
    utter.lang = tamilVoice.lang || 'ta-IN';
    utter.voice = tamilVoice;
    utter.rate = 0.9;
    utter.onend = () => {
      utterRef.current = null;
      setSpeaking(false);
    };
    utter.onerror = (e) => {
      utterRef.current = null;
      setSpeaking(false);
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        setTamilSpeechNotice(
          `Tamil speech playback failed (${e.error || 'audio error'}).`,
        );
      }
    };
    utterRef.current = utter;
    setSpeaking(true);
    speakTimerRef.current = window.setTimeout(() => {
      synth.speak(utter);
    }, 45);
  };

  const scrollTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const features: Array<{
    label: string;
    route: AppRoute;
    icon: typeof SlidersHorizontal;
  }> = [
    { label: 'Text Customization', route: 'studio', icon: SlidersHorizontal },
    { label: 'Speech Highlighting', route: 'studio', icon: Volume2 },
    { label: 'Focus Tools', route: 'studio', icon: Ruler },
    { label: 'OCR Scan', route: 'scan', icon: Camera },
    { label: 'AI Simplification', route: 'ai-tools', icon: Wand2 },
    { label: 'Reading Library', route: 'library', icon: FolderHeart },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6EC] text-[#0F1B2E] font-['Plus_Jakarta_Sans',sans-serif]">
      {/* 1. Minimal Header */}
      <header className="border-b border-[#E5DEC9] bg-[#FAF6EC]/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({
                top: 0,
                behavior: reducedMotion ? 'auto' : 'smooth',
              });
            }}
            className="inline-flex items-center gap-2 font-['Lexend',sans-serif] text-base font-bold tracking-tight text-[#0F1B2E] whitespace-nowrap shrink-0"
          >
            <BookOpenText className="h-5 w-5 text-[#0D7D6E]" aria-hidden />
            <span>DylexiVision</span>
          </a>

          <nav
            aria-label="Primary"
            className="flex items-center gap-5 sm:gap-7 text-sm font-medium text-[#3B4B63]"
          >
            <button
              type="button"
              onClick={() => scrollTo('about')}
              className="hover:text-[#0D7D6E] transition-colors whitespace-nowrap"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => scrollTo('features')}
              className="hover:text-[#0D7D6E] transition-colors whitespace-nowrap"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => onGetStarted()}
              className="rounded-lg bg-[#0D7D6E] px-3.5 py-1.5 min-h-[36px] text-sm font-semibold text-white hover:bg-[#0A6458] transition-colors whitespace-nowrap shrink-0"
            >
              Get Started
            </button>
          </nav>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* 2. Compact Hero + 4. Tamil Demo Preview */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="grid gap-8 lg:grid-cols-12 items-center">
            {/* Hero Copy */}
            <div className="lg:col-span-5 space-y-4">
              <h1 className="font-['Lexend',sans-serif] text-3xl sm:text-4xl font-bold tracking-tight text-[#0F1B2E] leading-[1.15] [text-wrap:balance]">
                Reading should feel easier, not harder.
              </h1>

              <p className="text-base text-[#3B4B63] leading-relaxed">
                DylexiVision helps people with dyslexia and reading difficulties
                read comfortably using tailored typography, focus guides, and
                read-aloud support.
              </p>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onGetStarted()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0D7D6E] px-5 py-2.5 min-h-[42px] text-sm font-semibold text-white hover:bg-[#0A6458] transition-colors whitespace-nowrap"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* Tamil Reading Preview (Main visual centerpiece) */}
            <div className="lg:col-span-7 space-y-2">
              <div className="rounded-xl border border-[#DFD7C2] bg-white shadow-sm overflow-hidden">
                <div className="border-b border-[#EFEAD8] px-4 py-2.5 flex items-center justify-between gap-2 bg-[#FDFBF5]">
                  <span className="text-xs font-semibold text-[#0D7D6E] font-tamil">
                    தமிழ் வாசிப்பு · Tamil Reading Preview
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      aria-label={
                        playing
                          ? 'Pause Tamil highlight preview'
                          : 'Play Tamil highlight preview'
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-[#E5DEC9] bg-white px-2.5 py-1 text-xs font-medium text-[#0F1B2E] hover:border-[#0D7D6E]"
                    >
                      {playing ? (
                        <Pause className="h-3 w-3 text-[#0D7D6E]" aria-hidden />
                      ) : (
                        <Play className="h-3 w-3 text-[#0D7D6E]" aria-hidden />
                      )}
                      {playing ? 'Pause' : 'Play'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSpeakTamil}
                      aria-label="Read Tamil preview aloud"
                      className="inline-flex items-center gap-1 rounded-md border border-[#E5DEC9] bg-white px-2.5 py-1 text-xs font-medium text-[#0F1B2E] hover:border-[#0D7D6E]"
                    >
                      <Volume2
                        className="h-3.5 w-3.5 text-[#0D7D6E]"
                        aria-hidden
                      />
                      {speaking ? 'Stop' : 'Listen'}
                    </button>
                  </div>
                </div>

                {/* Cream reading surface with reading ruler & word highlights */}
                <div className="bg-[#FAF6EC] p-4 sm:p-5 space-y-2 font-tamil">
                  {TAMIL_LINES.map((words, lineIdx) => {
                    const isFocused = currentWord.lineIdx === lineIdx;
                    return (
                      <div
                        key={lineIdx}
                        className={`rounded-lg px-3 py-2 transition-all duration-200 ${
                          isFocused
                            ? 'border-y border-[#0D7D6E] bg-white'
                            : 'opacity-45'
                        }`}
                      >
                        <p className="text-lg sm:text-[20px] leading-[1.85] tracking-[0.02em] flex flex-wrap gap-x-2 gap-y-1">
                          {words.map((word, wordIdx) => {
                            const flatIdx =
                              TAMIL_LINES.slice(0, lineIdx).reduce(
                                (sum, l) => sum + l.length,
                                0,
                              ) + wordIdx;
                            const isSelected = flatIdx === activeWordIdx;
                            return (
                              <button
                                key={`${lineIdx}-${wordIdx}`}
                                type="button"
                                onClick={() => {
                                  setPlaying(false);
                                  setActiveWordIdx(flatIdx);
                                }}
                                className={`rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#0D7D6E] text-white font-semibold'
                                    : 'text-[#0F1B2E] hover:bg-[#D7F2ED]'
                                }`}
                              >
                                {word}
                              </button>
                            );
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-[#EFEAD8] bg-white px-4 py-2 flex items-center justify-between text-xs text-[#4A5A75]">
                  <span className="inline-flex items-center gap-1.5">
                    <Ruler className="h-3.5 w-3.5 text-[#0D7D6E]" aria-hidden />
                    Reading ruler &amp; spaced Tamil type
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onGetStarted({
                        route: 'studio',
                        sampleText: TAMIL_SAMPLE_PASSAGE,
                      })
                    }
                    className="font-semibold text-[#0D7D6E] hover:underline whitespace-nowrap"
                  >
                    Open in Studio →
                  </button>
                </div>
              </div>

              {tamilSpeechNotice && (
                <p
                  role="status"
                  className="text-xs font-medium text-[#9A3412] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2"
                >
                  {tamilSpeechNotice}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] text-[#4A5A75]">
                <span className="font-medium">
                  Active: English &amp; தமிழ் (Tamil)
                </span>
                <span aria-hidden>·</span>
                <span className="font-semibold">Coming Soon:</span>
                {COMING_SOON_LANGUAGES.map((lang) => (
                  <span
                    key={lang}
                    aria-disabled="true"
                    className="rounded border border-[#DFD7C2] px-1.5 py-0.5 opacity-60 cursor-not-allowed select-none"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Dyslexia & Reported Reach (Compact, well-attributed) */}
        <section
          id="about"
          className="border-t border-[#E5DEC9] bg-[#FDFBF6] py-8 sm:py-10"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-5">
            <div className="max-w-3xl space-y-2">
              <h2 className="font-['Lexend',sans-serif] text-lg font-bold text-[#0F1B2E]">
                What is dyslexia?
              </h2>
              <p className="text-sm sm:text-base text-[#3B4B63] leading-relaxed">
                Dyslexia is a learning difference that affects reading,
                spelling, and how written words are processed. It is not related
                to intelligence—adjusting spacing, contrast, focus lines, and
                audio support simply makes text easier to follow.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#E5DEC9] bg-white px-4 py-3.5 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-['Lexend',sans-serif] text-xl font-bold text-[#0D7D6E] tabular-nums">
                    ~7.1%
                  </span>
                  <span className="text-xs font-semibold text-[#4A5A75]">
                    Global
                  </span>
                </div>
                <p className="text-xs text-[#3B4B63] leading-relaxed">
                  Estimated pooled prevalence among primary-school children
                  worldwide (2022 meta-analysis; studies vary ~5%–10%).
                </p>
              </div>

              <div className="rounded-lg border border-[#E5DEC9] bg-white px-4 py-3.5 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-['Lexend',sans-serif] text-xl font-bold text-[#0D7D6E] tabular-nums">
                    10%–15%
                  </span>
                  <span className="text-xs font-semibold text-[#4A5A75]">
                    India
                  </span>
                </div>
                <p className="text-xs text-[#3B4B63] leading-relaxed">
                  Estimated share of school-going children affected across India
                  (Dyslexia Association of India &amp; screening studies).
                </p>
              </div>

              <div className="rounded-lg border border-[#E5DEC9] bg-white px-4 py-3.5 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-['Lexend',sans-serif] text-xl font-bold text-[#0F1B2E] tabular-nums">
                    ~20 Lakh
                  </span>
                  <span className="text-xs font-semibold text-[#0D7D6E]">
                    Tamil Nadu
                  </span>
                </div>
                <p className="text-xs text-[#3B4B63] leading-relaxed">
                  Reported estimate of children with dyslexia in Tamil Nadu
                  (Madras Dyslexia Association founder interview, 2020; reported
                  estimate, not an official census).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Six Compact Feature Items */}
        <section
          id="features"
          className="border-t border-[#E5DEC9] py-8 sm:py-10"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-4">
            <h2 className="font-['Lexend',sans-serif] text-lg font-bold text-[#0F1B2E]">
              Features
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {features.map(({ label, route, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onGetStarted({ route })}
                  className="rounded-lg border border-[#E5DEC9] bg-white px-3 py-3.5 text-left hover:border-[#0D7D6E] transition-colors flex flex-col gap-2"
                >
                  <Icon className="h-4 w-4 text-[#0D7D6E]" aria-hidden />
                  <span className="text-xs font-semibold text-[#0F1B2E] leading-snug">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* 6. Minimal Footer */}
      <footer className="border-t border-[#E5DEC9] bg-[#FDFBF6] py-5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-[#3B4B63]">
          <span>Free to use • Designed for accessibility</span>
          <button
            type="button"
            onClick={() => onGetStarted()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D7D6E] px-4 py-1.5 min-h-[36px] text-xs font-semibold text-white hover:bg-[#0A6458] transition-colors whitespace-nowrap"
          >
            Get Started
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}
