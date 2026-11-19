import {
  ArrowRight,
  BookmarkCheck,
  BookOpen,
  Camera,
  Clock,
  FolderHeart,
  Languages,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { countWords, type LibraryItem } from '@/lib/library';
import type { ThemeStyleTokens } from '@/settings';

export type AppRoute =
  | 'home'
  | 'studio'
  | 'scan'
  | 'ai-tools'
  | 'library'
  | 'settings';

interface HomePageProps {
  text: string;
  onTextChange: (text: string) => void;
  onLoadSample: () => void;
  onStartReading: () => void;
  onSaveToLibrary: () => void;
  onNavigate: (route: AppRoute) => void;
  onOpenLibraryItem: (item: LibraryItem) => void;
  recentItems: LibraryItem[];
  warmWelcome: boolean;
  savedNotice: string | null;
  tokens: ThemeStyleTokens;
}

export function HomePage({
  text,
  onTextChange,
  onLoadSample,
  onStartReading,
  onSaveToLibrary,
  onNavigate,
  onOpenLibraryItem,
  recentItems,
  warmWelcome,
  savedNotice,
  tokens,
}: HomePageProps) {
  const words = countWords(text);
  const hasText = words > 0;
  const estMinutes = Math.max(1, Math.ceil(words / 180));

  const shortcuts: Array<{
    route: AppRoute;
    title: string;
    description: string;
    cta: string;
    icon: typeof Camera;
  }> = [
    {
      route: 'studio',
      title: 'Reading Studio',
      description:
        'Six reading modes, live speech highlighting, bionic reading, reading ruler, and full typography control.',
      cta: 'Open studio',
      icon: BookOpen,
    },
    {
      route: 'scan',
      title: 'Scan Text (OCR)',
      description:
        'Extract text from photographed pages, screenshots, or camera capture right in your browser.',
      cta: 'Scan image',
      icon: Camera,
    },
    {
      route: 'ai-tools',
      title: 'AI Tools & Translator',
      description:
        'Simplify passages, check word meanings & synonyms, chunk paragraphs, and translate between English and Tamil.',
      cta: 'Open tools',
      icon: Wand2,
    },
    {
      route: 'library',
      title: 'My Library',
      description:
        'Save passages locally, bookmark favorites, search reading history, and resume where you left off.',
      cta: 'Browse library',
      icon: FolderHeart,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
      {/* Hero + Quick Composer */}
      <section className="grid gap-8 lg:grid-cols-12 items-start">
        <div className="lg:col-span-5 space-y-5 pt-2">
          <div className="flex items-center gap-2.5">
            <span className="h-0.5 w-6 bg-teal-600" aria-hidden />
            <p
              className={`text-xs font-bold uppercase tracking-wider ${tokens.dark ? 'text-teal-400' : 'text-teal-700'}`}
            >
              Reading Workspace
            </p>
          </div>
          <h1
            className={`font-display text-3xl sm:text-[40px] font-bold tracking-tight leading-[1.12] [text-wrap:balance] ${tokens.text}`}
          >
            Read comfortably, at your own pace.
          </h1>
          <p className={`text-base leading-relaxed ${tokens.subtext}`}>
            Adjust spacing, isolate lines with the reading ruler, listen with
            live highlighting, scan printed pages, or translate between English
            and Tamil.
          </p>

          {warmWelcome && (
            <p
              className={`text-sm font-medium border-t pt-4 ${tokens.border} ${tokens.dark ? 'text-teal-300' : 'text-teal-700'}`}
            >
              Welcome back — your saved preferences and history are ready.
            </p>
          )}

          {/* Quick capability list */}
          <ul className={`space-y-2 text-sm border-t pt-4 ${tokens.border} ${tokens.subtext}`}>
            <li className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
              <span>OpenDyslexic, Atkinson Hyperlegible &amp; Lexend</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Languages className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
              <span>English &amp; தமிழ் (Tamil) · More languages coming soon</span>
            </li>
            <li className="flex items-center gap-2.5">
              <BookmarkCheck className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
              <span>Private browser storage — no account needed</span>
            </li>
          </ul>
        </div>

        {/* Text Entry Card */}
        <div
          className={`lg:col-span-7 rounded-2xl border p-5 sm:p-7 shadow-[0_14px_36px_-14px_rgba(78,116,124,0.16)] ${tokens.panelBg} ${tokens.border}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className={`font-display text-lg font-bold ${tokens.text}`}>
                Your reading text
              </h2>
              <p className={`text-xs mt-0.5 tabular-nums ${tokens.subtext}`}>
                {hasText
                  ? `${words} words · ~${estMinutes} min read`
                  : 'Paste, type, or scan any passage'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onLoadSample}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 min-h-[38px] text-xs font-semibold transition-colors whitespace-nowrap ${tokens.secondaryBtn}`}
              >
                <Sparkles className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                Load sample
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scan')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 min-h-[38px] text-xs font-semibold transition-colors whitespace-nowrap ${tokens.secondaryBtn}`}
              >
                <Camera className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                Scan image
              </button>
              {text && (
                <button
                  type="button"
                  onClick={() => onTextChange('')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 min-h-[38px] text-xs font-semibold transition-colors whitespace-nowrap ${
                    tokens.dark
                      ? 'border-[#2D4366] bg-[#1A2D49] text-[#FF8A80] hover:border-coral-500'
                      : 'border-[#DCE5E1] bg-white text-coral-600 hover:border-coral-500'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Clear
                </button>
              )}
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste an article, homework passage, email, or story here…"
            rows={8}
            aria-label="Reading text input"
            className={`w-full resize-y rounded-xl border px-4 py-3.5 text-base leading-relaxed focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${tokens.input}`}
          />

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onStartReading}
              disabled={!hasText}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 min-h-[46px] text-sm sm:text-base font-bold text-white shadow-sm hover:bg-teal-700 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            >
              Start reading in Studio
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onSaveToLibrary}
              disabled={!hasText}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 min-h-[46px] text-sm font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${tokens.secondaryBtn}`}
            >
              <BookmarkCheck className="h-4 w-4 text-teal-600" aria-hidden />
              Save to Library
            </button>
          </div>

          {savedNotice && (
            <p
              role="status"
              aria-live="polite"
              className={`mt-3 text-sm font-medium ${tokens.dark ? 'text-teal-300' : 'text-teal-700'}`}
            >
              {savedNotice}
            </p>
          )}
        </div>
      </section>

      {/* Feature Shortcuts */}
      <section aria-label="Workspace shortcuts">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2 className={`font-display text-xl font-bold ${tokens.text}`}>
            Accessibility tools
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`text-sm font-semibold hover:underline ${tokens.dark ? 'text-teal-400' : 'text-teal-700'}`}
          >
            Customize defaults
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shortcuts.map(({ route, title, description, cta, icon: Icon }) => (
            <button
              key={route}
              type="button"
              onClick={() => onNavigate(route)}
              className={`group text-left rounded-2xl border p-5 transition-all flex flex-col justify-between gap-4 hover:border-teal-600 hover:-translate-y-0.5 ${tokens.panelBg} ${tokens.border}`}
            >
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <Icon
                    className={`h-5 w-5 ${tokens.dark ? 'text-teal-400' : 'text-teal-600'}`}
                    aria-hidden
                  />
                  <ArrowRight
                    className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 ${tokens.subtext}`}
                    aria-hidden
                  />
                </div>
                <h3 className={`font-display font-bold text-base ${tokens.text}`}>
                  {title}
                </h3>
                <p className={`mt-1.5 text-sm leading-relaxed ${tokens.subtext}`}>
                  {description}
                </p>
              </div>
              <span
                className={`text-xs font-bold ${tokens.dark ? 'text-teal-400' : 'text-teal-700'}`}
              >
                {cta}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Recent Readings */}
      <section aria-label="Recent readings">
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2 className={`text-xl font-bold ${tokens.text}`}>
            Recent readings
          </h2>
          {recentItems.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className={`text-sm font-semibold hover:underline ${tokens.dark ? 'text-teal-400' : 'text-teal-700'}`}
            >
              View all ({recentItems.length})
            </button>
          )}
        </div>

        {recentItems.length === 0 ? (
          <div
            className={`rounded-2xl border p-6 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${tokens.panelBg} ${tokens.border}`}
          >
            <p className={tokens.subtext}>
              Your saved passages and reading history will appear here once you
              save text or open items in Reading Studio.
            </p>
            <button
              type="button"
              onClick={() => {
                onLoadSample();
                onSaveToLibrary();
              }}
              className={`rounded-xl border px-4 py-2 min-h-[40px] text-sm font-semibold whitespace-nowrap shrink-0 ${tokens.secondaryBtn}`}
            >
              Save sample to Library
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentItems.slice(0, 3).map((item) => {
              const pct =
                item.totalSentences > 0
                  ? Math.min(
                      100,
                      Math.round(
                        ((item.progressSentenceIndex + 1) /
                          item.totalSentences) *
                          100,
                      ),
                    )
                  : 0;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between gap-3 ${tokens.panelBg} ${tokens.border}`}
                >
                  <div>
                    <div
                      className={`flex items-center gap-2 text-xs mb-1.5 tabular-nums ${tokens.subtext}`}
                    >
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      <span>{item.wordCount} words</span>
                      <span aria-hidden>·</span>
                      <span>
                        {new Date(item.lastOpenedAt).toLocaleDateString()}
                      </span>
                      {item.bookmarked && (
                        <>
                          <span aria-hidden>·</span>
                          <span
                            className={
                              tokens.dark ? 'text-teal-400' : 'text-teal-700'
                            }
                          >
                            Bookmarked
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className={`font-bold line-clamp-1 ${tokens.text}`}>
                      {item.title}
                    </h3>
                    <p className={`mt-1 text-sm line-clamp-2 ${tokens.subtext}`}>
                      {item.content}
                    </p>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between text-xs tabular-nums">
                      <span className={tokens.subtext}>Progress</span>
                      <span className={tokens.subtext}>{pct}%</span>
                    </div>
                    <div
                      className={`h-1.5 rounded-full overflow-hidden ${tokens.dark ? 'bg-[#0F1B2E]' : 'bg-cream-200'}`}
                    >
                      <div
                        className="h-full bg-teal-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenLibraryItem(item)}
                      className="mt-1 w-full rounded-xl bg-teal-600 px-4 py-2 min-h-[40px] text-sm font-semibold text-white hover:bg-teal-500 transition-colors"
                    >
                      Continue reading
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
