export type SupportedLanguageCode = 'en' | 'ta';

export interface LanguageOption {
  code: SupportedLanguageCode;
  label: string;
  nativeName: string;
  speechLang: string;
  ocrCode: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'en',
    label: 'English',
    nativeName: 'English',
    speechLang: 'en-US',
    ocrCode: 'eng',
  },
  {
    code: 'ta',
    label: 'Tamil',
    nativeName: 'தமிழ்',
    speechLang: 'ta-IN',
    ocrCode: 'tam',
  },
];

export const COMING_SOON_LANGUAGES = [
  'Hindi',
  'Malayalam',
  'Kannada',
  'Telugu',
] as const;

export function getLanguageMeta(code: string): LanguageOption {
  return (
    SUPPORTED_LANGUAGES.find((lang) => lang.code === code) ??
    SUPPORTED_LANGUAGES[0]
  );
}

const TAMIL_CHAR_REGEX = /[\u0B80-\u0BFF]/;

export function containsTamilScript(text: string): boolean {
  return TAMIL_CHAR_REGEX.test(text);
}

export function detectTextLanguage(text: string): SupportedLanguageCode {
  return containsTamilScript(text) ? 'ta' : 'en';
}
