import type { CSSProperties } from 'react';

export type Theme = 'light' | 'cream' | 'soft-blue' | 'soft-green' | 'dark';

export type ReadingMode =
  | 'comfortable'
  | 'focus'
  | 'line-focus'
  | 'sentence-focus'
  | 'chunk'
  | 'paragraph'
  | 'karaoke';

export type ReadingWidth = 'narrow' | 'medium' | 'wide' | 'full';
export type TextAlignment = 'left' | 'justify' | 'center';
export type RulerColor = 'teal' | 'amber' | 'blue' | 'rose' | 'neutral';
export type RulerFocusArea = 'narrow' | 'medium' | 'wide';

export interface ReadingSettings {
  fontSize: number;
  letterSpacing: number;
  wordSpacing: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
  theme: Theme;
  readingMode: ReadingMode;
  readingWidth: ReadingWidth;
  marginX: number;
  textAlign: TextAlignment;
  customTextColor: string | null;
  customBgColor: string | null;
  bionicReading: boolean;
  punctuationFocus: boolean;
  mirrorLetterAlert: boolean;
  englishSyllables: boolean;
  tamilSyllableGrouping: boolean;
  tamilVowelHighlight: boolean;
  chunkSize: number;
  rulerEnabled: boolean;
  rulerHeight: number;
  rulerColor: RulerColor;
  rulerOpacity: number;
  rulerFocusArea: RulerFocusArea;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: ReadingSettings = {
  fontSize: 20,
  letterSpacing: 0.4,
  wordSpacing: 1,
  lineHeight: 1.7,
  paragraphSpacing: 1.2,
  fontFamily: 'Atkinson Hyperlegible',
  theme: 'cream',
  readingMode: 'comfortable',
  readingWidth: 'medium',
  marginX: 24,
  textAlign: 'left',
  customTextColor: null,
  customBgColor: null,
  bionicReading: false,
  punctuationFocus: false,
  mirrorLetterAlert: false,
  englishSyllables: false,
  tamilSyllableGrouping: false,
  tamilVowelHighlight: false,
  chunkSize: 3,
  rulerEnabled: false,
  rulerHeight: 52,
  rulerColor: 'teal',
  rulerOpacity: 0.45,
  rulerFocusArea: 'medium',
  reducedMotion: false,
};

export const FONT_OPTIONS = [
  'Atkinson Hyperlegible',
  'Lexend',
  'OpenDyslexic',
  'Verdana',
  'Georgia',
  'Plus Jakarta Sans',
  'Courier New',
];

export const THEME_PRESETS: {
  id: Theme;
  label: string;
  swatchBg: string;
  swatchText: string;
}[] = [
  { id: 'light', label: 'Paper White', swatchBg: '#FFFFFF', swatchText: '#0F1B2E' },
  { id: 'cream', label: 'Cream', swatchBg: '#FAF6EC', swatchText: '#0F1B2E' },
  { id: 'soft-blue', label: 'Soft Blue', swatchBg: '#EEF5FC', swatchText: '#0F253D' },
  { id: 'soft-green', label: 'Soft Green', swatchBg: '#EEF7F1', swatchText: '#112E1F' },
  { id: 'dark', label: 'Dark Mode', swatchBg: '#0F1B2E', swatchText: '#FAF6EC' },
];

export const READING_MODES: {
  id: ReadingMode;
  label: string;
  description: string;
}[] = [
  {
    id: 'comfortable',
    label: 'Comfortable',
    description: 'Balanced reading layout with quick settings side-by-side.',
  },
  {
    id: 'focus',
    label: 'Focus Mode',
    description: 'Hides navigation and sidebars for distraction-free reading.',
  },
  {
    id: 'line-focus',
    label: 'Line Focus',
    description: 'Enables a horizontal reading ruler and dims surrounding lines.',
  },
  {
    id: 'sentence-focus',
    label: 'Sentence Focus',
    description: 'Highlights one sentence at a time with arrow or click stepping.',
  },
  {
    id: 'chunk',
    label: 'Chunk Reading',
    description: 'Breaks long passages into small sections with Next/Previous controls.',
  },
  {
    id: 'paragraph',
    label: 'Paragraph Mode',
    description: 'Separates paragraphs into distinct, calm reading cards.',
  },
  {
    id: 'karaoke',
    label: 'Karaoke Reading',
    description: 'Reads aloud with live word highlighting when supported, or sentence-level fallback.',
  },
];

export const READING_WIDTH_CLASSES: Record<ReadingWidth, string> = {
  narrow: 'max-w-[52ch]',
  medium: 'max-w-[66ch]',
  wide: 'max-w-[82ch]',
  full: 'max-w-full',
};

export const LIMITS = {
  fontSize: { min: 14, max: 42, step: 1 },
  letterSpacing: { min: 0, max: 8, step: 0.5 },
  wordSpacing: { min: 0, max: 16, step: 1 },
  lineHeight: { min: 1.1, max: 3.0, step: 0.1 },
  paragraphSpacing: { min: 0, max: 4, step: 0.5 },
  marginX: { min: 0, max: 64, step: 4 },
  chunkSize: { min: 1, max: 8, step: 1 },
  rulerHeight: { min: 28, max: 120, step: 4 },
  rulerOpacity: { min: 0.1, max: 0.85, step: 0.05 },
} as const;

const STORAGE_KEY = 'dylexivision-settings';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampSettings(settings: ReadingSettings): ReadingSettings {
  return {
    ...settings,
    fontSize: clamp(settings.fontSize, LIMITS.fontSize.min, LIMITS.fontSize.max),
    letterSpacing: clamp(
      settings.letterSpacing,
      LIMITS.letterSpacing.min,
      LIMITS.letterSpacing.max,
    ),
    wordSpacing: clamp(
      settings.wordSpacing,
      LIMITS.wordSpacing.min,
      LIMITS.wordSpacing.max,
    ),
    lineHeight: clamp(
      settings.lineHeight,
      LIMITS.lineHeight.min,
      LIMITS.lineHeight.max,
    ),
    paragraphSpacing: clamp(
      settings.paragraphSpacing,
      LIMITS.paragraphSpacing.min,
      LIMITS.paragraphSpacing.max,
    ),
    marginX: clamp(settings.marginX, LIMITS.marginX.min, LIMITS.marginX.max),
    chunkSize: clamp(
      settings.chunkSize,
      LIMITS.chunkSize.min,
      LIMITS.chunkSize.max,
    ),
    rulerHeight: clamp(
      settings.rulerHeight,
      LIMITS.rulerHeight.min,
      LIMITS.rulerHeight.max,
    ),
    rulerOpacity: clamp(
      settings.rulerOpacity,
      LIMITS.rulerOpacity.min,
      LIMITS.rulerOpacity.max,
    ),
  };
}

export function hasSavedSettings(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ReadingSettings>;
    return clampSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ReadingSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode); settings just won't persist
  }
}

export interface ThemeStyleTokens {
  dark: boolean;
  pageBg: string;
  panelBg: string;
  cardBg: string;
  border: string;
  text: string;
  subtext: string;
  input: string;
  secondaryBtn: string;
  highlightSentence: string;
  paperHex: string;
  inkHex: string;
  textStyles: CSSProperties;
}

export function themeClasses(
  theme: Theme,
  customTextColor?: string | null,
  customBgColor?: string | null,
): ThemeStyleTokens {
  let tokens: Omit<ThemeStyleTokens, 'textStyles'>;

  switch (theme) {
    case 'light':
      tokens = {
        dark: false,
        pageBg: 'bg-[#F8FAFC] text-[#0F1B2E]',
        panelBg: 'bg-white',
        cardBg: 'bg-white',
        border: 'border-slate-200',
        text: 'text-[#0F1B2E]',
        subtext: 'text-[#475973]',
        input: 'border-slate-200 bg-white text-[#0F1B2E]',
        secondaryBtn:
          'border-slate-200 bg-white text-[#0F1B2E] hover:border-teal-600 hover:text-teal-700',
        highlightSentence: 'bg-teal-100/90 text-[#0F1B2E] ring-2 ring-teal-500/40',
        paperHex: '#FFFFFF',
        inkHex: '#0F1B2E',
      };
      break;
    case 'soft-blue':
      tokens = {
        dark: false,
        pageBg: 'bg-[#EEF4FB] text-[#0F253D]',
        panelBg: 'bg-white shadow-sm',
        cardBg: 'bg-[#F3F8FE]',
        border: 'border-[#C8DCF0]',
        text: 'text-[#0F253D]',
        subtext: 'text-[#39587A]',
        input: 'border-[#C8DCF0] bg-white text-[#0F253D]',
        secondaryBtn:
          'border-[#C8DCF0] bg-white text-[#0F253D] hover:border-teal-600 hover:text-teal-700',
        highlightSentence: 'bg-[#CBE3FA] text-[#0B1D30] ring-2 ring-teal-600/35',
        paperHex: '#EEF5FC',
        inkHex: '#0F253D',
      };
      break;
    case 'soft-green':
      tokens = {
        dark: false,
        pageBg: 'bg-[#EDF6F0] text-[#112E1F]',
        panelBg: 'bg-white shadow-sm',
        cardBg: 'bg-[#F2F9F4]',
        border: 'border-[#C5E0CE]',
        text: 'text-[#112E1F]',
        subtext: 'text-[#385E49]',
        input: 'border-[#C5E0CE] bg-white text-[#112E1F]',
        secondaryBtn:
          'border-[#C5E0CE] bg-white text-[#112E1F] hover:border-teal-600 hover:text-teal-700',
        highlightSentence: 'bg-[#CBEAD7] text-[#0B2216] ring-2 ring-teal-600/35',
        paperHex: '#EEF7F1',
        inkHex: '#112E1F',
      };
      break;
    case 'dark':
      tokens = {
        dark: true,
        pageBg: 'bg-[#0B1524] text-[#FAF6EC]',
        panelBg: 'bg-[#142238]',
        cardBg: 'bg-[#16263D]',
        border: 'border-[#273B59]',
        text: 'text-[#FAF6EC]',
        subtext: 'text-[#B8C5D9]',
        input: 'border-[#2D4366] bg-[#0F1B2E] text-[#FAF6EC]',
        secondaryBtn:
          'border-[#2D4366] bg-[#1A2D49] text-[#FAF6EC] hover:border-teal-400 hover:text-teal-300',
        highlightSentence: 'bg-teal-600/35 text-white ring-2 ring-teal-400/70',
        paperHex: '#16263D',
        inkHex: '#FAF6EC',
      };
      break;
    default:
      tokens = {
        dark: false,
        pageBg: 'bg-[#FAF6EC] text-[#0F1B2E]',
        panelBg: 'bg-[#FDFBF6]',
        cardBg: 'bg-[#FAF6EC]',
        border: 'border-[#E6DEC8]',
        text: 'text-[#0F1B2E]',
        subtext: 'text-[#475973]',
        input: 'border-[#E6DEC8] bg-white text-[#0F1B2E]',
        secondaryBtn:
          'border-[#E6DEC8] bg-white text-[#0F1B2E] hover:border-teal-600 hover:text-teal-700',
        highlightSentence: 'bg-teal-100 text-[#0F1B2E] ring-2 ring-teal-600/40',
        paperHex: '#FAF6EC',
        inkHex: '#0F1B2E',
      };
      break;
  }

  const finalBg = customBgColor || tokens.paperHex;
  const finalColor = customTextColor || tokens.inkHex;

  return {
    ...tokens,
    textStyles: {
      backgroundColor: finalBg,
      color: finalColor,
    },
  };
}
