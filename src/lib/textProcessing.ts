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
    const rawSentences =
      para.match(/[^.!?]+(?:[.!?]+["'”’)]*)?(?=\s|$)/g) ?? [para];
    const cleanSentences = rawSentences
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

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

export function simplifyTextOffline(text: string): {
  simplified: string;
  changes: Array<{ original: string; simpler: string }>;
} {
  const changesMap = new Map<string, string>();
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const outputParagraphs: string[] = [];

  for (const para of paragraphs) {
    // 1. Replace formal words with plain-English equivalents preserving capitalization
    const replaced = para.replace(/\b[A-Za-z]+\b/g, (word) => {
      const lower = word.toLowerCase();
      const sub = PLAIN_ENGLISH_MAP[lower];
      if (!sub) return word;
      changesMap.set(lower, sub);
      if (word[0] === word[0].toUpperCase()) {
        return sub.charAt(0).toUpperCase() + sub.slice(1);
      }
      return sub;
    });

    // 2. Break very long sentences at semicolons, em-dashes, or subordinating conjunctions
    const rawSentences =
      replaced.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()) ?? [replaced];

    const shortSentences: string[] = [];
    for (const s of rawSentences) {
      if (s.split(/\s+/).length <= 16) {
        shortSentences.push(s);
        continue;
      }
      const parts = s
        .split(/\s*[;—]\s*|\s*,\s+(?=(?:but|so|because|although|however|while)\b)/i)
        .map((part) => part.trim())
        .filter(Boolean);

      for (let i = 0; i < parts.length; i += 1) {
        let p = parts[i];
        p = p.charAt(0).toUpperCase() + p.slice(1);
        if (!/[.!?]$/.test(p)) p += '.';
        shortSentences.push(p);
      }
    }

    // Group into short 2-sentence paragraphs
    for (let i = 0; i < shortSentences.length; i += 2) {
      outputParagraphs.push(shortSentences.slice(i, i + 2).join(' '));
    }
  }

  return {
    simplified: outputParagraphs.join('\n\n'),
    changes: Array.from(changesMap.entries()).map(([original, simpler]) => ({
      original,
      simpler,
    })),
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

export function easierEnglishOffline(text: string): {
  simplified: string;
  changes: Array<{ original: string; simpler: string }>;
} {
  let working = text;
  const phraseChanges: Array<{ original: string; simpler: string }> = [];

  for (const [pattern, replacement, label] of EASIER_PHRASES) {
    if (pattern.test(working)) {
      phraseChanges.push({ original: label, simpler: replacement });
      working = working.replace(pattern, (match) =>
        match[0] === match[0].toUpperCase()
          ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
          : replacement,
      );
    }
  }

  const base = simplifyTextOffline(working);
  return {
    simplified: base.simplified,
    changes: [...phraseChanges, ...base.changes],
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

export function extractKeyPointsOffline(text: string, maxPoints = 5): string[] {
  const { sentences } = parsePassage(text);
  if (sentences.length <= maxPoints) {
    return sentences.map((s) => s.text);
  }

  const freq = new Map<string, number>();
  for (const s of sentences) {
    const words = s.text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    for (const w of words) {
      if (!STOPWORDS.has(w)) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
  }

  const scored = sentences.map((s, idx) => {
    const words = s.text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    let score = 0;
    for (const w of words) {
      score += freq.get(w) ?? 0;
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
    const longWords = sentence.match(/\b[A-Za-z]{5,}\b/g) ?? [];
    let target = longWords.find((w) => !STOPWORDS.has(w.toLowerCase()));

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
    const regex = new RegExp(escaped);
    const prompt = sentence.replace(regex, '______');
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
