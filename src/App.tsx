import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  BookOpenText,
  Camera,
  FolderHeart,
  Home,
  Menu,
  Settings as SettingsIcon,
  Wand2,
  X,
} from 'lucide-react';
import { AiToolsPage } from '@/components/AiToolsPage';
import { HomePage, type AppRoute } from '@/components/HomePage';
import { LandingPage } from '@/components/LandingPage';
import { LibraryPage } from '@/components/LibraryPage';
import { ReaderPage } from '@/components/ReaderPage';
import { ScanTextPage } from '@/components/ScanTextPage';
import { SettingsPage } from '@/components/SettingsPage';
import { useSpeech } from '@/hooks/useSpeech';
import {
  deleteLibraryItem,
  loadLibrary,
  renameLibraryItem,
  savePassageToLibrary,
  toggleBookmarkLibraryItem,
  updateReadingProgress,
  type LibraryItem,
} from '@/lib/library';
import { SAMPLE_TEXT } from '@/sampleText';
import {
  clampSettings,
  DEFAULT_SETTINGS,
  hasSavedSettings,
  loadSettings,
  saveSettings,
  themeClasses,
  type ReadingSettings,
} from '@/settings';

const TEXT_KEY = 'dylexivision-text';

const NAV_ITEMS: Array<{
  id: AppRoute;
  label: string;
  icon: typeof Home;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'studio', label: 'Reading Studio', icon: BookOpen },
  { id: 'scan', label: 'Scan Text', icon: Camera },
  { id: 'ai-tools', label: 'AI Tools', icon: Wand2 },
  { id: 'library', label: 'My Library', icon: FolderHeart },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [viewMode, setViewMode] = useState<'landing' | 'app'>('landing');
  const [route, setRoute] = useState<AppRoute>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(TEXT_KEY) ?? '';
    } catch {
      return '';
    }
  });

  const [settings, setSettings] = useState<ReadingSettings>(() =>
    loadSettings(),
  );
  const [library, setLibrary] = useState<LibraryItem[]>(() => loadLibrary());
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [initialSentenceIndex, setInitialSentenceIndex] = useState(0);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [warmWelcome] = useState(() => {
    const hadSettings = hasSavedSettings();
    const hadLibrary = loadLibrary().length > 0;
    let hadText = false;
    try {
      hadText = Boolean(localStorage.getItem(TEXT_KEY)?.trim());
    } catch {
      hadText = false;
    }
    return hadSettings || hadLibrary || hadText;
  });

  const speech = useSpeech();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    saveSettings(settingsRef.current);
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [settings.reducedMotion]);

  useEffect(() => {
    if (!savedNotice) return;
    const timer = window.setTimeout(() => setSavedNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  const handleSettingsChange = useCallback(
    (patch: Partial<ReadingSettings>) => {
      setSettings((prev) => clampSettings({ ...prev, ...patch }));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const handleTextChange = useCallback((nextText: string) => {
    setText(nextText);
    setActiveLibraryId(null);
    setInitialSentenceIndex(0);
    try {
      localStorage.setItem(TEXT_KEY, nextText);
    } catch {
      // storage unavailable
    }
  }, []);

  const handleLoadSample = useCallback(() => {
    handleTextChange(SAMPLE_TEXT);
  }, [handleTextChange]);

  const navigate = useCallback(
    (nextRoute: AppRoute) => {
      setViewMode('app');
      setRoute(nextRoute);
      setMobileMenuOpen(false);
      if (nextRoute !== 'studio' && settings.readingMode === 'focus') {
        handleSettingsChange({ readingMode: 'comfortable' });
      }
    },
    [settings.readingMode, handleSettingsChange],
  );

  const handleGetStarted = useCallback(
    (options?: { route?: AppRoute; sampleText?: string }) => {
      if (options?.sampleText) {
        setText(options.sampleText);
        setActiveLibraryId(null);
        setInitialSentenceIndex(0);
        try {
          localStorage.setItem(TEXT_KEY, options.sampleText);
        } catch {
          // ignore
        }
      }
      setViewMode('app');
      setRoute(options?.route ?? 'home');
      setMobileMenuOpen(false);
      window.scrollTo({ top: 0 });
    },
    [],
  );

  const handleSaveToLibrary = useCallback(
    (
      contentToSave?: string,
      source: LibraryItem['source'] = 'typed',
      title?: string,
    ) => {
      const targetContent = (contentToSave ?? text).trim();
      if (!targetContent) return;
      const { items, saved, persisted } = savePassageToLibrary({
        content: contentToSave ?? text,
        source,
        title,
        existingId: contentToSave ? null : activeLibraryId,
      });
      setLibrary(items);
      setActiveLibraryId(saved.id);
      setSavedNotice(
        persisted
          ? `Saved "${saved.title}" to My Library.`
          : 'Browser storage is full or blocked—kept in this session only.',
      );
    },
    [text, activeLibraryId],
  );

  const handleOpenInStudio = useCallback(
    (nextText?: string, source: LibraryItem['source'] = 'typed') => {
      if (typeof nextText === 'string' && nextText.trim()) {
        setText(nextText);
        try {
          localStorage.setItem(TEXT_KEY, nextText);
        } catch {
          // ignore
        }
        const { items, saved } = savePassageToLibrary({
          content: nextText,
          source,
        });
        setLibrary(items);
        setActiveLibraryId(saved.id);
        setInitialSentenceIndex(0);
      } else if (text.trim() && !activeLibraryId) {
        const { items, saved } = savePassageToLibrary({
          content: text,
          source: text.trim() === SAMPLE_TEXT.trim() ? 'sample' : 'typed',
        });
        setLibrary(items);
        setActiveLibraryId(saved.id);
      }
      setRoute('studio');
      setMobileMenuOpen(false);
    },
    [text, activeLibraryId],
  );

  const handleOpenLibraryItem = useCallback((item: LibraryItem) => {
    setText(item.content);
    try {
      localStorage.setItem(TEXT_KEY, item.content);
    } catch {
      // ignore
    }
    setActiveLibraryId(item.id);
    setInitialSentenceIndex(item.progressSentenceIndex || 0);
    const updated = updateReadingProgress(
      item.id,
      item.progressSentenceIndex || 0,
      item.totalSentences || 1,
    );
    setLibrary(updated);
    setRoute('studio');
    setMobileMenuOpen(false);
  }, []);

  const handleProgressChange = useCallback(
    (sentenceIndex: number, totalSentences: number) => {
      if (!activeLibraryId) return;
      setLibrary((prev) => {
        const target = prev.find((i) => i.id === activeLibraryId);
        if (
          target &&
          target.progressSentenceIndex === sentenceIndex &&
          target.totalSentences === totalSentences
        ) {
          return prev;
        }
        return updateReadingProgress(
          activeLibraryId,
          sentenceIndex,
          totalSentences,
        );
      });
    },
    [activeLibraryId],
  );

  const tokens = themeClasses(
    settings.theme,
    settings.customTextColor,
    settings.customBgColor,
  );

  const hideTopNav =
    route === 'studio' && settings.readingMode === 'focus';

  if (viewMode === 'landing') {
    return (
      <LandingPage
        onGetStarted={handleGetStarted}
        reducedMotion={settings.reducedMotion}
      />
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${tokens.pageBg}`}>
      {!hideTopNav && (
        <header
          className={`sticky top-0 z-30 border-b backdrop-blur-md ${tokens.border} ${
            tokens.dark ? 'bg-[#0B1524]/95' : 'bg-[#FAF6EC]/95'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            {/* Zone 1: Brand */}
            <button
              type="button"
              onClick={() => {
                setViewMode('landing');
                setMobileMenuOpen(false);
                window.scrollTo({ top: 0 });
              }}
              title="Back to DylexiVision Landing Page"
              className={`inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0 ${tokens.text}`}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                <BookOpenText className="h-4 w-4" aria-hidden />
              </span>
              <span>DylexiVision</span>
            </button>

            {/* Zone 2: Desktop Navigation */}
            <nav
              aria-label="Primary navigation"
              className="hidden md:flex items-center gap-1 lg:gap-1.5"
            >
              <button
                type="button"
                onClick={() => {
                  setViewMode('landing');
                  window.scrollTo({ top: 0 });
                }}
                className={`rounded-lg px-3 py-1.5 min-h-[38px] text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tokens.dark
                    ? 'text-[#D6E1F0] hover:bg-[#16263D] hover:text-white'
                    : 'text-[#3B4B63] hover:bg-[#EFE7D4] hover:text-[#0F1B2E]'
                }`}
              >
                Overview
              </button>
              {NAV_ITEMS.map(({ id, label }) => {
                const active = route === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigate(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`rounded-lg px-3 py-1.5 min-h-[38px] text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-teal-600 text-white'
                        : tokens.dark
                          ? 'text-[#D6E1F0] hover:bg-[#16263D] hover:text-white'
                          : 'text-[#3B4B63] hover:bg-[#EFE7D4] hover:text-[#0F1B2E]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Primary Action + Mobile Menu Trigger */}
            <div className="flex items-center gap-2 shrink-0">
              {route !== 'studio' && (
                <button
                  type="button"
                  onClick={() => {
                    if (text.trim()) {
                      handleOpenInStudio();
                    } else {
                      handleLoadSample();
                      setRoute('studio');
                    }
                  }}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 min-h-[38px] text-sm font-semibold text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  {text.trim() ? 'Open Studio' : 'Try Sample'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setMobileMenuOpen((o) => !o)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                className={`md:hidden inline-flex items-center justify-center rounded-xl border p-2 min-h-[42px] min-w-[42px] ${tokens.secondaryBtn}`}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" aria-hidden />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Drawer Navigation */}
          {mobileMenuOpen && (
            <nav
              aria-label="Mobile navigation"
              className={`md:hidden border-t px-4 py-3 grid grid-cols-2 gap-2 ${tokens.border} ${tokens.panelBg}`}
            >
              <button
                type="button"
                onClick={() => {
                  setViewMode('landing');
                  setMobileMenuOpen(false);
                  window.scrollTo({ top: 0 });
                }}
                className={`col-span-2 inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-semibold ${tokens.secondaryBtn} border`}
              >
                <BookOpenText className="h-4 w-4 shrink-0" aria-hidden />
                <span>Back to Landing Page</span>
              </button>
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const active = route === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigate(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-semibold ${
                      active
                        ? 'bg-teal-600 text-white'
                        : tokens.secondaryBtn + ' border'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </header>
      )}

      <main className="flex-1">
        {route === 'home' && (
          <HomePage
            text={text}
            onTextChange={handleTextChange}
            onLoadSample={handleLoadSample}
            onStartReading={() => handleOpenInStudio()}
            onSaveToLibrary={() =>
              handleSaveToLibrary(
                undefined,
                text.trim() === SAMPLE_TEXT.trim() ? 'sample' : 'typed',
              )
            }
            onNavigate={navigate}
            onOpenLibraryItem={handleOpenLibraryItem}
            recentItems={library}
            warmWelcome={warmWelcome}
            savedNotice={savedNotice}
            tokens={tokens}
          />
        )}

        {route === 'studio' && (
          <ReaderPage
            text={text}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onReset={handleReset}
            onBackHome={() => navigate('home')}
            onSaveToLibrary={() => handleSaveToLibrary(undefined, 'typed')}
            onProgressChange={handleProgressChange}
            initialSentenceIndex={initialSentenceIndex}
            speech={speech}
            savedNotice={savedNotice}
          />
        )}

        {route === 'scan' && (
          <ScanTextPage
            onSendToStudio={(extracted, source) =>
              handleOpenInStudio(extracted, source ?? 'ocr')
            }
            onSaveToLibrary={(extracted, title) =>
              handleSaveToLibrary(extracted, 'ocr', title)
            }
            tokens={tokens}
          />
        )}

        {route === 'ai-tools' && (
          <AiToolsPage
            text={text}
            onTextChange={handleTextChange}
            onOpenInStudio={(newText, source) =>
              handleOpenInStudio(newText, source ?? 'ai')
            }
            onSaveToLibrary={(content, source) =>
              handleSaveToLibrary(content, source ?? 'ai')
            }
            speech={speech}
            tokens={tokens}
          />
        )}

        {route === 'library' && (
          <LibraryPage
            items={library}
            currentText={text}
            onSaveCurrent={(title) =>
              handleSaveToLibrary(undefined, 'typed', title)
            }
            onOpenItem={handleOpenLibraryItem}
            onSendToAiTools={(item) => {
              setText(item.content);
              try {
                localStorage.setItem(TEXT_KEY, item.content);
              } catch {
                // ignore
              }
              setActiveLibraryId(item.id);
              navigate('ai-tools');
            }}
            onRenameItem={(id, title) =>
              setLibrary(renameLibraryItem(id, title))
            }
            onToggleBookmark={(id) =>
              setLibrary(toggleBookmarkLibraryItem(id))
            }
            onDeleteItem={(id) => {
              setLibrary(deleteLibraryItem(id));
              if (activeLibraryId === id) setActiveLibraryId(null);
            }}
            tokens={tokens}
          />
        )}

        {route === 'settings' && (
          <SettingsPage
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onResetAll={handleReset}
            tokens={tokens}
          />
        )}
      </main>
    </div>
  );
}
