export interface LibraryItem {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  bookmarked: boolean;
  source: 'typed' | 'sample' | 'ocr' | 'ai' | 'translated';
  progressSentenceIndex: number;
  totalSentences: number;
}

const LIBRARY_KEY = 'dylexivision-library-v1';

export function deriveTitleFromText(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return 'Untitled passage';
  if (firstLine.length <= 54) return firstLine;
  return `${firstLine.slice(0, 51).trimEnd()}…`;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(
    /(?:[^.!?]|[.!?](?!["'”’)\]]*(?:\s|$)))+(?:[.!?]+["'”’)\]]*)?/g,
  );
  return matches ? matches.filter((s) => s.trim().length > 0).length : 1;
}

export function loadLibrary(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch {
    return [];
  }
}

function persistLibrary(items: LibraryItem[]): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function savePassageToLibrary(params: {
  title?: string;
  content: string;
  source?: LibraryItem['source'];
  existingId?: string | null;
  progressSentenceIndex?: number;
}): { items: LibraryItem[]; saved: LibraryItem; persisted: boolean } {
  const items = loadLibrary();
  const now = Date.now();
  const trimmedContent = params.content.trim();
  const wordCount = countWords(trimmedContent);
  const totalSentences = countSentences(trimmedContent);

  if (params.existingId) {
    const idx = items.findIndex((item) => item.id === params.existingId);
    if (idx !== -1) {
      const updated: LibraryItem = {
        ...items[idx],
        title: params.title?.trim() || items[idx].title,
        content: params.content,
        wordCount,
        totalSentences,
        updatedAt: now,
        lastOpenedAt: now,
        progressSentenceIndex:
          params.progressSentenceIndex ?? items[idx].progressSentenceIndex,
      };
      const next = [updated, ...items.filter((i) => i.id !== params.existingId)];
      const persisted = persistLibrary(next);
      return { items: next, saved: updated, persisted };
    }
  }

  // Avoid duplicate identical entries when saving the exact same text
  const duplicate = items.find(
    (item) => item.content.trim() === trimmedContent,
  );
  if (duplicate) {
    const updated: LibraryItem = {
      ...duplicate,
      title: params.title?.trim() || duplicate.title,
      lastOpenedAt: now,
      updatedAt: now,
      progressSentenceIndex:
        params.progressSentenceIndex ?? duplicate.progressSentenceIndex,
    };
    const next = [updated, ...items.filter((i) => i.id !== duplicate.id)];
    const persisted = persistLibrary(next);
    return { items: next, saved: updated, persisted };
  }

  const created: LibraryItem = {
    id: `doc_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: params.title?.trim() || deriveTitleFromText(trimmedContent),
    content: params.content,
    wordCount,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    bookmarked: false,
    source: params.source ?? 'typed',
    progressSentenceIndex: params.progressSentenceIndex ?? 0,
    totalSentences,
  };

  const next = [created, ...items];
  const persisted = persistLibrary(next);
  return { items: next, saved: created, persisted };
}

export function renameLibraryItem(id: string, title: string): LibraryItem[] {
  const items = loadLibrary();
  const next = items.map((item) =>
    item.id === id
      ? { ...item, title: title.trim() || item.title, updatedAt: Date.now() }
      : item,
  );
  persistLibrary(next);
  return next;
}

export function toggleBookmarkLibraryItem(id: string): LibraryItem[] {
  const items = loadLibrary();
  const next = items.map((item) =>
    item.id === id ? { ...item, bookmarked: !item.bookmarked } : item,
  );
  persistLibrary(next);
  return next;
}

export function deleteLibraryItem(id: string): LibraryItem[] {
  const items = loadLibrary();
  const next = items.filter((item) => item.id !== id);
  persistLibrary(next);
  return next;
}

export function updateReadingProgress(
  id: string,
  sentenceIndex: number,
  totalSentences: number,
): LibraryItem[] {
  const items = loadLibrary();
  const next = items.map((item) =>
    item.id === id
      ? {
          ...item,
          lastOpenedAt: Date.now(),
          progressSentenceIndex: Math.max(0, sentenceIndex),
          totalSentences: Math.max(1, totalSentences),
        }
      : item,
  );
  persistLibrary(next);
  return next;
}
