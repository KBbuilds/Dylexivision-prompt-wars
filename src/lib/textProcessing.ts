export interface SentenceItem {
  index: number;
  paragraphIndex: number;
  text: string;
}

export interface ParagraphBlock {
  paragraphIndex: number;
  sentences: SentenceItem[];
}

export interface ReadingChunk {
  chunkIndex: number;
  startSentence: number;
  endSentence: number;
  wordCount: number;
  paragraphs: ParagraphBlock[];
}

const SAFE_SENTENCE_RE =
  /(?:[^.!?]|[.!?](?!["'”’)\]]*(?:\s|$)))+(?:[.!?]+["'”’)\]]*)?/g;

export function splitSentences(para: string): string[] {
  const matches = para.match(SAFE_SENTENCE_RE) ?? [para];
  const cleaned = matches.map((s) => s.trim()).filter((s) => s.length > 0);
  return cleaned.length > 0 ? cleaned : [para.trim()].filter(Boolean);
}

export function parsePassage(rawText: string): {
  paragraphs: ParagraphBlock[];
  sentences: SentenceItem[];
} {
  const rawParagraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const paragraphs: ParagraphBlock[] = [];
  const sentences: SentenceItem[] = [];
  let globalIndex = 0;

  rawParagraphs.forEach((para, pIdx) => {
    const cleanSentences = splitSentences(para);

    const items: SentenceItem[] = (
      cleanSentences.length > 0 ? cleanSentences : [para]
    ).map((sentenceText) => {
      const item: SentenceItem = {
        index: globalIndex,
        paragraphIndex: pIdx,
        text: sentenceText,
      };
      globalIndex += 1;
      sentences.push(item);
      return item;
    });

    paragraphs.push({
      paragraphIndex: pIdx,
      sentences: items,
    });
  });

  return { paragraphs, sentences };
}

export function buildReadingChunks(
  paragraphs: ParagraphBlock[],
  sentencesPerChunk: number,
): ReadingChunk[] {
  const size = Math.max(1, sentencesPerChunk);
  const allSentences = paragraphs.flatMap((p) => p.sentences);
  if (allSentences.length === 0) return [];

  const chunks: ReadingChunk[] = [];
  for (let i = 0; i < allSentences.length; i += size) {
    const slice = allSentences.slice(i, i + size);
    const byParagraph = new Map<number, SentenceItem[]>();
    for (const s of slice) {
      const list = byParagraph.get(s.paragraphIndex) ?? [];
      list.push(s);
      byParagraph.set(s.paragraphIndex, list);
    }

    const chunkParagraphs: ParagraphBlock[] = Array.from(
      byParagraph.entries(),
    ).map(([paragraphIndex, sents]) => ({
      paragraphIndex,
      sentences: sents,
    }));

    const wordCount = slice
      .map((s) => s.text)
      .join(' ')
      .trim()
      .split(/\s+/).length;

    chunks.push({
      chunkIndex: chunks.length,
      startSentence: slice[0].index,
      endSentence: slice[slice.length - 1].index,
      wordCount,
      paragraphs: chunkParagraphs,
    });
  }

  return chunks;
}

export interface BionicToken {
  leadingPunct: string;
  boldPart: string;
  restPart: string;
  trailingPunct: string;
}

/**
 * Splits a single token into bold prefix and remaining suffix while preserving
 * exact original spelling, capitalization, and punctuation.
 */
export function splitBionicToken(token: string): BionicToken {
  const match = token.match(/^([^A-Za-z0-9À-ÖØ-öø-ÿ]*)([A-Za-z0-9À-ÖØ-öø-ÿ'-]+)([^A-Za-z0-9À-ÖØ-öø-ÿ]*)$/);
  if (!match) {
    return {
      leadingPunct: '',
      boldPart: '',
      restPart: token,
      trailingPunct: '',
    };
  }

  const [, leadingPunct, core, trailingPunct] = match;
  const len = core.length;
  let boldLen = 1;
  if (len <= 1) boldLen = 1;
  else if (len <= 3) boldLen = 1;
  else if (len <= 5) boldLen = 2;
  else if (len <= 8) boldLen = 3;
  else boldLen = Math.ceil(len * 0.42);

  return {
    leadingPunct,
    boldPart: core.slice(0, boldLen),
    restPart: core.slice(boldLen),
    trailingPunct,
  };
}

// Offline rule-based plain-English replacements (transparent deterministic aid)
const PLAIN_ENGLISH_MAP: Record<string, string> = {
  approximately: 'about',
  additional: 'extra',
  assistance: 'help',
  commence: 'start',
  commenced: 'started',
  comprehend: 'understand',
  consequently: 'so',
  demonstrate: 'show',
  demonstrated: 'showed',
  determine: 'find out',
  eliminate: 'remove',
  encounter: 'meet',
  encountered: 'met',
  establish: 'set up',
  evaluate: 'check',
  facilitate: 'help',
  frequently: 'often',
  furthermore: 'also',
  however: 'but',
  implement: 'use',
  indicate: 'show',
  indicates: 'shows',
  individual: 'person',
  individuals: 'people',
  immediately: 'right away',
  magnificent: 'grand',
  modification: 'change',
  nevertheless: 'still',
  numerous: 'many',
  obtain: 'get',
  obtained: 'got',
  particular: 'specific',
  persisted: 'kept going',
  prior: 'before',
  provide: 'give',
  provided: 'gave',
  purchase: 'buy',
  regarding: 'about',
  require: 'need',
  required: 'needed',
  reside: 'live',
  select: 'choose',
  significant: 'important',
  significantly: 'a lot',
  subsequently: 'then',
  sufficient: 'enough',
  terminate: 'end',
  therefore: 'so',
  tremendous: 'huge',
  utilize: 'use',
  utilized: 'used',
  various: 'different',
};

const TAMIL_CHAR_RE = /[\u0B80-\u0BFF]/;

const PLAIN_TAMIL_MAP: Record<string, string> = {
  ஏனெனில்: 'ஏனென்றால்',
  ஆதலால்: 'அதனால்',
  ஆகவே: 'அதனால்',
  எனினும்: 'ஆனால்',
  இருப்பினும்: 'இருந்தாலும்',
  மேலும்: 'இன்னும்',
  தற்போது: 'இப்போது',
  உடனடியாக: 'உடனே',
  அனைவரும்: 'எல்லோரும்',
  பொதுவாக: 'வழக்கமாக',
  சிறப்பாக: 'நன்றாக',
  முக்கியமாக: 'குறிப்பாக',
  அவ்வாறு: 'அப்படி',
  இவ்வாறு: 'இப்படி',
  பயன்படுத்தவும்: 'பயன்படுத்துங்கள்',
  பயன்படுத்தப்படுகிறது: 'பயன்படுகிறது',
  உருவாக்கப்பட்டது: 'செய்யப்பட்டது',
  அதிகரித்து: 'கூடி',
  குறைந்து: 'குறைவாகி',
  தொடர்ந்து: 'விடாமல்',
  விரைவில்: 'சீக்கிரம்',
  பெரும்பாலும்: 'அதிகமாக',
  அதாவது: 'அதன் பொருள்',
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'it', 'its', 'this', 'that', 'these', 'those', 'they',
  'them', 'their', 'she', 'he', 'her', 'his', 'him', 'we', 'our', 'you', 'your',
  'i', 'my', 'me', 'not', 'no', 'so', 'if', 'then', 'than', 'when', 'where',
  'who', 'which', 'what', 'how', 'into', 'out', 'up', 'down', 'over', 'after',
  'before', 'all', 'each', 'some', 'more', 'most', 'very', 'just', 'only',
]);

const TAMIL_STOPWORDS = new Set([
  'மற்றும்', 'ஒரு', 'இந்த', 'அந்த', 'என்று', 'என்ற', 'அது', 'இது', 'உள்ள',
  'பல', 'நாம்', 'அவர்', 'அவர்கள்', 'இல்', 'ஆக', 'தான்', 'மிக', 'மிகவும்',
  'கொண்டு', 'செய்ய', 'வேண்டும்', 'உள்ளது', 'இருந்து', 'என', 'என்பது', 'அதன்',
  'இதன்', 'மேலும்', 'ஆனால்', 'அல்லது', 'கூட', 'போல', 'போன்ற', 'எல்லாம்',
  'அவர்', 'அவள்', 'அவன்', 'நான்', 'நீங்கள்', 'அவை', 'இவை', 'பற்றி', 'உடன்',
]);

function normalizeCompare(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function simplifyTextOffline(text: string): {
  simplified: string;
  changes: Array<{ original: string; simpler: string }>;
  changed: boolean;
} {
  const changesMap = new Map<string, string>();
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const outputParagraphs: string[] = [];

  for (const para of paragraphs) {
    const isTamilPara = TAMIL_CHAR_RE.test(para);

    // 1. Replace formal words (English word boundaries or Unicode token boundaries for Tamil)
    let replaced = para.replace(/\b[A-Za-z]+\b/g, (word) => {
      const lower = word.toLowerCase();
      const sub = PLAIN_ENGLISH_MAP[lower];
      if (!sub) return word;
      changesMap.set(lower, sub);
      if (word[0] === word[0].toUpperCase()) {
        return sub.charAt(0).toUpperCase() + sub.slice(1);
      }
      return sub;
    });

    if (isTamilPara) {
      replaced = replaced.replace(
        /(^|[\s,.?!;:"'“”‘’()[\]])([^\s,.?!;:"'“”‘’()[\]]+)(?=$|[\s,.?!;:"'“”‘’()[\]])/gu,
        (full, prefix: string, word: string) => {
          const sub = PLAIN_TAMIL_MAP[word];
          if (!sub) return full;
          changesMap.set(word, sub);
          return `${prefix}${sub}`;
        },
      );
    }

    // 2. Break very long sentences at clause markers
    const rawSentences = splitSentences(replaced);

    const shortSentences: string[] = [];
    const wordThreshold = isTamilPara ? 12 : 16;

    for (const s of rawSentences) {
      if (s.split(/\s+/).length <= wordThreshold) {
        shortSentences.push(s);
        continue;
      }

      const parts = isTamilPara
        ? s
            .split(
              /\s*[;—]\s*|\s*,\s+(?=(?:ஆனால்|ஏனென்றால்|அதனால்|இருந்தாலும்|அத்துடன்|மேலும்)(?:\s|$))/u,
            )
            .map((part) => part.trim())
            .filter(Boolean)
        : s
            .split(/\s*[;—]\s*|\s*,\s+(?=(?:but|so|because|although|however|while)\b)/i)
            .map((part) => part.trim())
            .filter(Boolean);

      for (let i = 0; i < parts.length; i += 1) {
        let p = parts[i];
        if (!isTamilPara) {
          p = p.charAt(0).toUpperCase() + p.slice(1);
        }
        if (!/[.!?]$/.test(p)) p += '.';
        shortSentences.push(p);
      }
    }

    // Group into short 2-sentence paragraphs
    for (let i = 0; i < shortSentences.length; i += 2) {
      outputParagraphs.push(shortSentences.slice(i, i + 2).join(' '));
    }
  }

  const simplified = outputParagraphs.join('\n\n');
  return {
    simplified,
    changes: Array.from(changesMap.entries()).map(([original, simpler]) => ({
      original,
      simpler,
    })),
    changed: normalizeCompare(simplified) !== normalizeCompare(text),
  };
}

const EASIER_PHRASES: Array<[RegExp, string, string]> = [
  [/\bin order to\b/gi, 'to', 'in order to'],
  [/\bdue to the fact that\b/gi, 'because', 'due to the fact that'],
  [/\ba large number of\b/gi, 'many', 'a large number of'],
  [/\bat this point in time\b/gi, 'now', 'at this point in time'],
  [/\bin the event that\b/gi, 'if', 'in the event that'],
  [/\bwith regard to\b/gi, 'about', 'with regard to'],
  [/\bprior to\b/gi, 'before', 'prior to'],
  [/\bsubsequent to\b/gi, 'after', 'subsequent to'],
  [/\bis able to\b/gi, 'can', 'is able to'],
  [/\bare able to\b/gi, 'can', 'are able to'],
  [/\bmake a decision\b/gi, 'decide', 'make a decision'],
  [/\btake into consideration\b/gi, 'consider', 'take into consideration'],
];

const EASIER_TAMIL_PHRASES: Array<[string, string]> = [
  ['அதன் காரணமாக', 'அதனால்'],
  ['இதன் காரணமாக', 'இதனால்'],
  ['அதே நேரத்தில்', 'அப்போது'],
  ['எந்த ஒரு', 'எந்த'],
  ['முடிந்த அளவு', 'இயன்றவரை'],
  ['விரிவான விளக்கம்', 'எளிய விளக்கம்'],
];

export function easierEnglishOffline(text: string): {
  simplified: string;
  changes: Array<{ original: string; simpler: string }>;
  changed: boolean;
} {
  let working = text;
  const phraseChanges: Array<{ original: string; simpler: string }> = [];

  for (const [pattern, replacement, label] of EASIER_PHRASES) {
    pattern.lastIndex = 0;
    if (pattern.test(working)) {
      pattern.lastIndex = 0;
      phraseChanges.push({ original: label, simpler: replacement });
      working = working.replace(pattern, (match) =>
        match[0] === match[0].toUpperCase()
          ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
          : replacement,
      );
    }
  }

  if (TAMIL_CHAR_RE.test(working)) {
    for (const [formalPhrase, simplerPhrase] of EASIER_TAMIL_PHRASES) {
      if (working.includes(formalPhrase)) {
        phraseChanges.push({ original: formalPhrase, simpler: simplerPhrase });
        working = working.split(formalPhrase).join(simplerPhrase);
      }
    }
  }

  const base = simplifyTextOffline(working);
  const combinedChanges = [...phraseChanges, ...base.changes];
  return {
    simplified: base.simplified,
    changes: combinedChanges,
    changed:
      combinedChanges.length > 0 ||
      normalizeCompare(base.simplified) !== normalizeCompare(text),
  };
}

export function chunkParagraphsOffline(text: string): string {
  const { paragraphs } = parsePassage(text);
  const chunks: string[] = [];

  for (const p of paragraphs) {
    const sents = p.sentences.map((s) => s.text);
    for (let i = 0; i < sents.length; i += 2) {
      chunks.push(sents.slice(i, i + 2).join(' '));
    }
  }
  return chunks.join('\n\n');
}

function tokenizeContentWords(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}]{2,}/gu) ?? [];
}

function isStopword(word: string): boolean {
  return STOPWORDS.has(word) || TAMIL_STOPWORDS.has(word);
}

export function extractKeyPointsOffline(text: string, maxPoints = 5): string[] {
  const { sentences } = parsePassage(text);
  if (sentences.length <= maxPoints) {
    return sentences.map((s) => s.text);
  }

  const freq = new Map<string, number>();
  for (const s of sentences) {
    const words = tokenizeContentWords(s.text);
    for (const w of words) {
      if (!isStopword(w)) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
  }

  const scored = sentences.map((s, idx) => {
    const words = tokenizeContentWords(s.text);
    let score = 0;
    for (const w of words) {
      if (!isStopword(w)) {
        score += freq.get(w) ?? 0;
      }
    }
    const normalized = words.length > 0 ? score / Math.sqrt(words.length) : 0;
    const positionBonus = idx === 0 ? 1.25 : idx === sentences.length - 1 ? 1.1 : 1;
    return { s, score: normalized * positionBonus };
  });

  const top = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPoints)
    .sort((a, b) => a.s.index - b.s.index);

  return top.map((item) => item.s.text);
}

export function summarizeOffline(text: string): string {
  return extractKeyPointsOffline(text, 3).join(' ');
}

export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  const vowelGroups = trimmed.replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

export function detectDifficultWords(text: string, limit = 12): Array<{
  word: string;
  syllables: number;
  length: number;
}> {
  const tokens = text.match(/\b[A-Za-z]{6,}\b/g) ?? [];
  const seen = new Set<string>();
  const candidates: Array<{ word: string; syllables: number; length: number }> = [];

  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (seen.has(lower) || STOPWORDS.has(lower)) continue;
    seen.add(lower);
    const syllables = countSyllables(lower);
    if (syllables >= 3 || lower.length >= 9) {
      candidates.push({ word: lower, syllables, length: lower.length });
    }
  }

  return candidates
    .sort((a, b) => b.syllables - a.syllables || b.length - a.length)
    .slice(0, limit);
}

export function detectLongTamilWords(
  text: string,
  limit = 12,
): Array<{ word: string; graphemeCount: number }> {
  const tokens = text.match(/[\u0B80-\u0BFF]+/g) ?? [];
  const seen = new Set<string>();
  const results: Array<{ word: string; graphemeCount: number }> = [];

  for (const word of tokens) {
    if (seen.has(word) || TAMIL_STOPWORDS.has(word)) continue;
    const graphemeCount = segmentTamilGraphemes(word).length;
    if (graphemeCount >= 4) {
      seen.add(word);
      results.push({ word, graphemeCount });
    }
  }

  return results
    .sort((a, b) => b.graphemeCount - a.graphemeCount)
    .slice(0, limit);
}

export function extractFallbackWord(text: string): string | null {
  const tokens = text.match(/\b[A-Za-z]{3,}\b/g) ?? [];
  const candidates = tokens
    .map((w) => w.toLowerCase())
    .filter((w) => !STOPWORDS.has(w));
  if (candidates.length === 0) {
    return tokens[0]?.toLowerCase() ?? null;
  }
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

export interface RecallItem {
  prompt: string;
  answer: string;
  fullSentence: string;
}

export function generateOfflineRecallPractice(text: string): RecallItem[] {
  const keySentences = extractKeyPointsOffline(text, 4);
  const items: RecallItem[] = [];

  for (const sentence of keySentences) {
    const longEnglish = sentence.match(/\b[A-Za-z]{5,}\b/g) ?? [];
    let target = longEnglish.find((w) => !STOPWORDS.has(w.toLowerCase()));

    if (!target) {
      const tamilWords = (sentence.match(/[\u0B80-\u0BFF]{3,}/g) ?? []).filter(
        (w) => !TAMIL_STOPWORDS.has(w),
      );
      if (tamilWords.length > 0) {
        target = tamilWords.sort((a, b) => b.length - a.length)[0];
      }
    }

    if (!target) {
      const shorterWords = sentence.match(/\b[A-Za-z]{3,}\b/g) ?? [];
      target = shorterWords.find((w) => !STOPWORDS.has(w.toLowerCase()));
    }

    if (!target) {
      const unicodeWords = sentence.match(/[\p{L}\p{M}]{3,}/gu) ?? [];
      target = unicodeWords[Math.floor(unicodeWords.length / 2)];
    }

    if (!target) continue;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isAsciiWord = /^[A-Za-z0-9]+$/.test(target);
    const regex = isAsciiWord
      ? new RegExp(`\\b${escaped}\\b`)
      : new RegExp(`(^|[\\s,.?!;:"'“”‘’()\\[\\]])${escaped}(?=$|[\\s,.?!;:"'“”‘’()\\[\\]])`, 'u');
    const prompt = isAsciiWord
      ? sentence.replace(regex, '______')
      : sentence.replace(regex, '$1______');
    if (prompt !== sentence) {
      items.push({
        prompt,
        answer: target,
        fullSentence: sentence,
      });
    }
  }
  return items;
}

export type PunctuationKind =
  | 'comma'
  | 'period'
  | 'question'
  | 'exclamation'
  | 'colon'
  | 'semicolon'
  | 'quote';

export interface SentenceToken {
  kind: 'word' | 'space' | 'punct' | 'other';
  text: string;
  wordIndex: number;
  charStart: number;
  charEnd: number;
  punctKind?: PunctuationKind;
}

const PUNCT_KIND_MAP: Record<string, PunctuationKind> = {
  ',': 'comma',
  '.': 'period',
  '?': 'question',
  '!': 'exclamation',
  ':': 'colon',
  ';': 'semicolon',
  '"': 'quote',
  "'": 'quote',
  '“': 'quote',
  '”': 'quote',
  '‘': 'quote',
  '’': 'quote',
};

const TOKEN_SCAN_RE =
  /(\s+)|([\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*)|([,.?!:;"'“”‘’])|([^\s\p{L}\p{M}\p{N},.?!:;"'“”‘’]+)/gu;

/**
 * Splits a sentence into exact character-preserving tokens for Karaoke word
 * boundary sync, Bionic reading, and Punctuation Focus without altering text.
 */
export function tokenizeSentence(sentenceText: string): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  let wordIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_SCAN_RE.lastIndex = 0;

  while ((match = TOKEN_SCAN_RE.exec(sentenceText)) !== null) {
    const text = match[0];
    const charStart = match.index;
    const charEnd = charStart + text.length;

    if (match[1]) {
      tokens.push({ kind: 'space', text, wordIndex: -1, charStart, charEnd });
    } else if (match[2]) {
      tokens.push({
        kind: 'word',
        text,
        wordIndex,
        charStart,
        charEnd,
      });
      wordIndex += 1;
    } else if (match[3]) {
      tokens.push({
        kind: 'punct',
        text,
        wordIndex: -1,
        charStart,
        charEnd,
        punctKind: PUNCT_KIND_MAP[text],
      });
    } else {
      tokens.push({ kind: 'other', text, wordIndex: -1, charStart, charEnd });
    }
  }

  return tokens;
}

export function findWordIndexAtCharOffset(
  tokens: SentenceToken[],
  charIndex: number,
): number | null {
  let lastWordBefore: number | null = null;

  for (const token of tokens) {
    if (token.kind !== 'word') continue;
    if (charIndex >= token.charStart && charIndex < token.charEnd) {
      return token.wordIndex;
    }
    if (token.charStart > charIndex) {
      // If browser reports boundary slightly before word (e.g. on leading quote/space), snap forward
      if (token.charStart - charIndex <= 3) {
        return token.wordIndex;
      }
      return lastWordBefore ?? token.wordIndex;
    }
    lastWordBefore = token.wordIndex;
  }

  return lastWordBefore;
}

export function detectSentenceEndPunctuation(sentenceText: string): {
  symbol: string;
  label: string;
  pauseMs: number;
} | null {
  const trimmed = sentenceText.trim().replace(/["'”’)\]]+$/, '');
  const last = trimmed.slice(-1);
  if (last === '?') {
    return { symbol: '?', label: 'Question boundary · Pause', pauseMs: 340 };
  }
  if (last === '!') {
    return { symbol: '!', label: 'Exclamation boundary · Pause', pauseMs: 320 };
  }
  if (last === '.') {
    return { symbol: '.', label: 'Full stop · Sentence pause', pauseMs: 260 };
  }
  if (last === ':' || last === ';') {
    return { symbol: last, label: 'Clause boundary · Brief pause', pauseMs: 220 };
  }
  return null;
}

// ---------- Mirror Letter Alert (English b/d, p/q, m/w) ----------
export type MirrorLetterKey = 'b' | 'd' | 'p' | 'q' | 'm' | 'w';

export function getMirrorLetterKey(ch: string): MirrorLetterKey | null {
  switch (ch.toLowerCase()) {
    case 'b':
      return 'b';
    case 'd':
      return 'd';
    case 'p':
      return 'p';
    case 'q':
      return 'q';
    case 'm':
      return 'm';
    case 'w':
      return 'w';
    default:
      return null;
  }
}

// ---------- English Syllable Reading Mode (English-only) ----------
const EN_DIGRAPHS = new Set([
  'ch', 'sh', 'th', 'ph', 'wh', 'ck', 'ng', 'qu',
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw',
]);

const EN_KNOWN_SUFFIXES = [
  'tion', 'sion', 'ment', 'ness', 'able', 'ible', 'less', 'ful', 'ing', 'ous', 'ive', 'ly',
];

function isAsciiVowel(ch: string): boolean {
  return ch === 'a' || ch === 'e' || ch === 'i' || ch === 'o' || ch === 'u' || ch === 'y';
}

/**
 * Splits a plain English alphabetic word into orthographic syllables.
 * Never alters spelling; returns [word] if non-English or short/unsplit.
 */
export function splitEnglishSyllables(word: string): string[] {
  if (!/^[A-Za-z]+$/.test(word) || word.length <= 3) {
    return [word];
  }

  const lower = word.toLowerCase();
  if (!/[aeiouy]/.test(lower)) return [word];

  // Check clean suffix peel at end if stem keeps a vowel sound
  for (const suf of EN_KNOWN_SUFFIXES) {
    if (lower.endsWith(suf) && lower.length - suf.length >= 3) {
      const stem = word.slice(0, word.length - suf.length);
      const suffixPart = word.slice(word.length - suf.length);
      if (/[aeiouy]/i.test(stem)) {
        // Avoid orphan consonant before vowel-starting suffix like -ing/-able if safe
        return [...splitEnglishSyllables(stem), suffixPart];
      }
    }
  }

  // Build syllable split points across vowel nuclei
  const vowelSpans: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < lower.length) {
    const ch = lower[i];
    const treatYAsVowel = ch === 'y' && i > 0;
    if ((ch !== 'y' && isAsciiVowel(ch)) || treatYAsVowel) {
      // Skip silent trailing e after a consonant when earlier vowel exists
      const isSilentTrailingE =
        ch === 'e' &&
        i === lower.length - 1 &&
        vowelSpans.length >= 1 &&
        i >= 2 &&
        !(lower[i - 1] === 'l' && !isAsciiVowel(lower[i - 2]));

      if (isSilentTrailingE) {
        i += 1;
        continue;
      }

      const start = i;
      i += 1;
      while (
        i < lower.length &&
        ((lower[i] !== 'y' && isAsciiVowel(lower[i])) || (lower[i] === 'y' && i > 0))
      ) {
        // Keep vowel teams together (ea, ee, oo, ai, ou, ie, ay, etc.)
        i += 1;
      }
      vowelSpans.push({ start, end: i });
    } else {
      i += 1;
    }
  }

  if (vowelSpans.length <= 1) {
    return [word];
  }

  const cuts: number[] = [];
  for (let v = 0; v < vowelSpans.length - 1; v += 1) {
    const leftEnd = vowelSpans[v].end;
    const rightStart = vowelSpans[v + 1].start;
    const between = lower.slice(leftEnd, rightStart);

    if (between.length === 0) {
      // Rare hiatus like "li·on" or "cre·ate"
      cuts.push(leftEnd);
    } else if (between.length === 1) {
      // VCV -> usually V·CV
      cuts.push(leftEnd);
    } else if (between.length === 2) {
      // Special Consonant+le ending (ta·ble, sim·ple)
      const afterRight = lower.slice(rightStart);
      if (
        lower[leftEnd + 1] === 'l' &&
        afterRight === 'e' &&
        rightStart === lower.length - 1
      ) {
        cuts.push(leftEnd);
      } else if (EN_DIGRAPHS.has(between)) {
        cuts.push(leftEnd);
      } else {
        cuts.push(leftEnd + 1);
      }
    } else {
      const lastTwo = between.slice(-2);
      if (EN_DIGRAPHS.has(lastTwo)) {
        cuts.push(rightStart - 2);
      } else {
        cuts.push(leftEnd + 1);
      }
    }
  }

  const result: string[] = [];
  let prev = 0;
  for (const c of cuts) {
    if (c > prev && c < word.length) {
      result.push(word.slice(prev, c));
      prev = c;
    }
  }
  result.push(word.slice(prev));

  return result.length > 0 ? result : [word];
}

// ---------- English Prefix / Root / Suffix Offline Explorer ----------
export interface EnglishMorphologyAnalysis {
  word: string;
  prefix: string;
  prefixMeaning: string;
  root: string;
  rootMeaning: string;
  suffix: string;
  suffixMeaning: string;
  howMeaningChanges: string;
  uncertain: boolean;
  note: string;
  provider?: string;
}

const EN_PREFIXES: Array<{ form: string; meaning: string }> = [
  { form: 'inter', meaning: 'between or among' },
  { form: 'under', meaning: 'below or too little' },
  { form: 'over', meaning: 'too much or above' },
  { form: 'anti', meaning: 'against' },
  { form: 'semi', meaning: 'half or partly' },
  { form: 'mis', meaning: 'wrongly or badly' },
  { form: 'dis', meaning: 'not or opposite of' },
  { form: 'non', meaning: 'not or without' },
  { form: 'pre', meaning: 'before' },
  { form: 'sub', meaning: 'under or beneath' },
  { form: 'un', meaning: 'not or reverse' },
  { form: 're', meaning: 'again or back' },
  { form: 'im', meaning: 'not (before m/p/b)' },
  { form: 'in', meaning: 'not or into' },
];

const EN_SUFFIXES: Array<{ form: string; meaning: string }> = [
  { form: 'ation', meaning: 'the act or result of' },
  { form: 'tion', meaning: 'act, state, or process of' },
  { form: 'sion', meaning: 'act or state of' },
  { form: 'ment', meaning: 'result or action of' },
  { form: 'ness', meaning: 'state or quality of being' },
  { form: 'able', meaning: 'capable of being' },
  { form: 'ible', meaning: 'capable of being' },
  { form: 'less', meaning: 'without' },
  { form: 'ful', meaning: 'full of' },
  { form: 'ing', meaning: 'ongoing action or process' },
  { form: 'est', meaning: 'most (superlative)' },
  { form: 'ous', meaning: 'having the quality of' },
  { form: 'ly', meaning: 'in that way (manner)' },
  { form: 'er', meaning: 'one who does / more' },
  { form: 'ed', meaning: 'past action or state' },
  { form: 'es', meaning: 'plural / present action' },
  { form: 's', meaning: 'plural / present action' },
];

export function analyzeEnglishMorphologyOffline(
  rawWord: string,
): EnglishMorphologyAnalysis {
  const clean = rawWord.trim().replace(/[^A-Za-z]/g, '').toLowerCase();
  if (!clean) {
    return {
      word: rawWord,
      prefix: '',
      prefixMeaning: '',
      root: rawWord,
      rootMeaning: '',
      suffix: '',
      suffixMeaning: '',
      howMeaningChanges: 'Enter a plain English word to inspect prefixes, roots, and suffixes.',
      uncertain: true,
      note: 'No alphabetic English word was provided.',
      provider: 'offline',
    };
  }

  let stem = clean;
  let prefix = '';
  let prefixMeaning = '';
  let suffix = '';
  let suffixMeaning = '';

  for (const p of EN_PREFIXES) {
    if (stem.startsWith(p.form) && stem.length - p.form.length >= 3) {
      prefix = p.form;
      prefixMeaning = p.meaning;
      stem = stem.slice(p.form.length);
      break;
    }
  }

  for (const s of EN_SUFFIXES) {
    if (stem.endsWith(s.form) && stem.length - s.form.length >= 3) {
      suffix = s.form;
      suffixMeaning = s.meaning;
      let nextStem = stem.slice(0, stem.length - s.form.length);
      // Simple spelling restoration (happi -> happy, runn -> run)
      if (nextStem.endsWith('i') && (s.form === 'ness' || s.form === 'ly' || s.form === 'ful' || s.form === 'er' || s.form === 'es' || s.form === 'ed')) {
        nextStem = `${nextStem.slice(0, -1)}y`;
      } else if (
        nextStem.length >= 3 &&
        nextStem[nextStem.length - 1] === nextStem[nextStem.length - 2] &&
        !'lssz'.includes(nextStem[nextStem.length - 1]) &&
        (s.form === 'ing' || s.form === 'ed' || s.form === 'er')
      ) {
        nextStem = nextStem.slice(0, -1);
      }
      stem = nextStem;
      break;
    }
  }

  const foundAffix = Boolean(prefix || suffix);
  const parts: string[] = [];
  if (prefix) parts.push(`"${prefix}-" (${prefixMeaning})`);
  parts.push(`root "${stem}"`);
  if (suffix) parts.push(`"-${suffix}" (${suffixMeaning})`);

  return {
    word: clean,
    prefix,
    prefixMeaning,
    root: stem,
    rootMeaning: foundAffix ? 'Base word (run AI analysis for full context meaning)' : 'Base or indivisible word',
    suffix,
    suffixMeaning,
    howMeaningChanges: foundAffix
      ? `Combines ${parts.join(' + ')} to adjust the base meaning or grammar role.`
      : `"${clean}" appears to be a single root word or requires AI etymology for hidden Greek/Latin roots.`,
    uncertain: true,
    note: foundAffix
      ? 'Rule-based offline breakdown. Verify with AI analysis for exact contextual meaning.'
      : 'No clear English prefix/suffix found offline. Try AI analysis for deeper root breakdown.',
    provider: 'offline',
  };
}

// ---------- Tamil Unicode & Reading Tools Helpers ----------
interface GraphemeSegmenterLike {
  segment(input: string): Iterable<{ segment: string }>;
}

let cachedTamilSegmenter: GraphemeSegmenterLike | null = null;
function getTamilSegmenter(): GraphemeSegmenterLike | null {
  if (cachedTamilSegmenter) return cachedTamilSegmenter;
  const intlObj = Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: 'grapheme' },
    ) => GraphemeSegmenterLike;
  };
  if (typeof intlObj !== 'undefined' && typeof intlObj.Segmenter === 'function') {
    cachedTamilSegmenter = new intlObj.Segmenter('ta', { granularity: 'grapheme' });
    return cachedTamilSegmenter;
  }
  return null;
}

/**
 * Splits Tamil text/word into intact Unicode grapheme clusters so vowel signs
 * (ா, ி, ீ, ு, ூ, ெ, ே, ை, ொ, ோ, ௌ) and pulli (்) stay attached to their consonant.
 */
export function segmentTamilGraphemes(text: string): string[] {
  const seg = getTamilSegmenter();
  if (seg) {
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return text.match(/[\u0B80-\u0BFF][\u0BBE-\u0BCD\u0BD7]*|[\s\S]/g) ?? [];
}

export type TamilVowelMarkerKind =
  | 'none'
  | 'pulli'
  | 'aa-kal'      // ா
  | 'i-ee'        // ி, ீ
  | 'u-uu'        // ு, ூ
  | 'e-ee-ai'     // ெ, ே, ை
  | 'two-part';   // ொ, ோ, ௌ

export interface TamilVowelMarkerInfo {
  kind: TamilVowelMarkerKind;
  markerChar: string;
  labelTa: string;
}

export function classifyTamilGraphemeVowel(grapheme: string): TamilVowelMarkerInfo {
  if (grapheme.includes('\u0BCD')) {
    return { kind: 'pulli', markerChar: '்', labelTa: 'மெய் (புள்ளி)' };
  }
  if (grapheme.includes('\u0BCA') || grapheme.includes('\u0BCB') || grapheme.includes('\u0BCC')) {
    const markerChar = grapheme.includes('\u0BCC')
      ? 'ௌ'
      : grapheme.includes('\u0BCB')
        ? 'ோ'
        : 'ொ';
    return { kind: 'two-part', markerChar, labelTa: 'இருபக்கத் துணைக் குறியீடு (ொ/ோ/ௌ)' };
  }
  if (grapheme.includes('\u0BBE')) {
    return { kind: 'aa-kal', markerChar: 'ா', labelTa: 'துணைக்கால் (ா)' };
  }
  if (grapheme.includes('\u0BBF') || grapheme.includes('\u0BC0')) {
    return {
      kind: 'i-ee',
      markerChar: grapheme.includes('\u0BC0') ? 'ீ' : 'ி',
      labelTa: 'சுழி / மேல்வளைவு (ி/ீ)',
    };
  }
  if (grapheme.includes('\u0BC1') || grapheme.includes('\u0BC2')) {
    return {
      kind: 'u-uu',
      markerChar: grapheme.includes('\u0BC2') ? 'ூ' : 'ு',
      labelTa: 'கீழ்வளைவு (ு/ூ)',
    };
  }
  if (grapheme.includes('\u0BC6') || grapheme.includes('\u0BC7') || grapheme.includes('\u0BC8')) {
    const markerChar = grapheme.includes('\u0BC8')
      ? 'ை'
      : grapheme.includes('\u0BC7')
        ? 'ே'
        : 'ெ';
    return { kind: 'e-ee-ai', markerChar, labelTa: 'கொம்பு / இணைக்கொம்பு (ெ/ே/ை)' };
  }
  return { kind: 'none', markerChar: '', labelTa: '' };
}

/**
 * Groups intact Tamil graphemes into natural sound units (அசை-சார் ஒலி அலகுகள்):
 * Each உயிர் or உயிர்மெய் opens a unit, and trailing மெய் (புள்ளி `்`) joins it.
 * Never separates a vowel sign from its consonant.
 */
export function groupTamilSoundUnits(word: string): string[] {
  const graphemes = segmentTamilGraphemes(word);
  if (graphemes.length <= 1) return graphemes;

  const units: string[] = [];
  for (const g of graphemes) {
    const isTamilPulli = /[\u0B80-\u0BFF]/.test(g) && g.includes('\u0BCD');
    if (isTamilPulli && units.length > 0 && /[\u0B80-\u0BFF]/.test(units[units.length - 1])) {
      units[units.length - 1] += g;
    } else {
      units.push(g);
    }
  }
  return units;
}

export interface TamilSandhiAnalysis {
  word: string;
  components: Array<{ part: string; role: string; meaningTa: string }>;
  root: string;
  suffixes: string[];
  overallMeaningTa: string;
  uncertain: boolean;
  note: string;
  provider?: string;
}

const TAMIL_COMMON_SUFFIXES: Array<{ suffix: string; meaningTa: string }> = [
  { suffix: 'களிலிருந்து', meaningTa: 'பன்மை + இடத்திலிருந்து (from plural)' },
  { suffix: 'களுடன்', meaningTa: 'பன்மை + உடன் (with plural)' },
  { suffix: 'களுக்கு', meaningTa: 'பன்மை + நான்காம் வேற்றுமை (to/for plural)' },
  { suffix: 'களில்', meaningTa: 'பன்மை + ஏழாம் வேற்றுமை (in/on plural)' },
  { suffix: 'களை', meaningTa: 'பன்மை + இரண்டாம் வேற்றுமை (object plural)' },
  { suffix: 'கள்', meaningTa: 'பன்மை விகுதி (plural marker)' },
  { suffix: 'இருந்து', meaningTa: 'நீங்கல் பொருள் (from)' },
  { suffix: 'உடன்', meaningTa: 'உடனிகழ்ச்சி (with)' },
  { suffix: 'உக்கு', meaningTa: 'நான்காம் வேற்றுமை (to/for)' },
  { suffix: 'க்காக', meaningTa: 'பொருட்டு (for the sake of)' },
];

export function analyzeTamilWordOffline(rawWord: string): TamilSandhiAnalysis {
  const clean = rawWord.trim().replace(/[^\u0B80-\u0BFF]/g, '');
  if (!clean) {
    return {
      word: rawWord,
      components: [],
      root: rawWord,
      suffixes: [],
      overallMeaningTa: 'சந்தி பிரிப்பதற்கு ஒரு தமிழ் சொல்லை உள்ளிடவும்.',
      uncertain: true,
      note: 'சரியான தமிழ் சொல் வழங்கப்படவில்லை.',
      provider: 'offline',
    };
  }

  const totalGraphemes = segmentTamilGraphemes(clean).length;
  for (const item of TAMIL_COMMON_SUFFIXES) {
    if (clean.endsWith(item.suffix) && clean.length > item.suffix.length + 1) {
      const rootPart = clean.slice(0, clean.length - item.suffix.length);
      if (segmentTamilGraphemes(rootPart).length >= 2) {
        return {
          word: clean,
          components: [
            { part: rootPart, role: 'வேர் / அடிச்சொல்', meaningTa: 'முதன்மைச் சொல் பகுதி' },
            { part: item.suffix, role: 'விகுதி / உருபு', meaningTa: item.meaningTa },
          ],
          root: rootPart,
          suffixes: [item.suffix],
          overallMeaningTa: `"${rootPart}" என்ற சொல்லுடன் "${item.suffix}" விகுதி இணைந்துள்ளது.`,
          uncertain: true,
          note: 'இது அடிப்படை விகுதிப் பிரிப்பு மட்டுமே. முழுமையான சந்தி மற்றும் பொருள் விளக்கத்திற்கு AI-ஐப் பயன்படுத்தவும்.',
          provider: 'offline',
        };
      }
    }
  }

  return {
    word: clean,
    components: [{ part: clean, role: 'முழுச் சொல்', meaningTa: 'தனிச்சொல் அல்லது AI பகுப்பாய்வு தேவைப்படும் கூட்டுச்சொல்' }],
    root: totalGraphemes <= 4 ? clean : '',
    suffixes: [],
    overallMeaningTa:
      'இந்தச் சொல்லின் துல்லியமான சந்தி மற்றும் பகுபத விளக்கத்தை அறிய "Analyze with Gemini AI" பொத்தானை அழுத்தவும்.',
    uncertain: true,
    note: 'உறுதியற்ற பிரிப்பைத் தவிர்க்க, ஆஃப்லைன் முறையில் இந்தச் சொல் தானாகப் பிரிக்கப்படவில்லை.',
    provider: 'offline',
  };
}

