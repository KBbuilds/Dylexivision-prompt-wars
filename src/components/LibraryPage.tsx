import { useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { countWords, type LibraryItem } from '@/lib/library';
import type { ThemeStyleTokens } from '@/settings';

interface LibraryPageProps {
  items: LibraryItem[];
  currentText: string;
  onSaveCurrent: (title?: string) => void;
  onOpenItem: (item: LibraryItem) => void;
  onSendToAiTools: (item: LibraryItem) => void;
  onRenameItem: (id: string, title: string) => void;
  onToggleBookmark: (id: string) => void;
  onDeleteItem: (id: string) => void;
  tokens: ThemeStyleTokens;
}

type FilterMode = 'all' | 'bookmarked' | 'recent';

export function LibraryPage({
  items,
  currentText,
  onSaveCurrent,
  onOpenItem,
  onSendToAiTools,
  onRenameItem,
  onToggleBookmark,
  onDeleteItem,
  tokens,
}: LibraryPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (filter === 'bookmarked' && !item.bookmarked) return false;
        if (q) {
          return (
            item.title.toLowerCase().includes(q) ||
            item.content.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) =>
        filter === 'recent'
          ? b.lastOpenedAt - a.lastOpenedAt
          : b.updatedAt - a.updatedAt,
      );
  }, [items, query, filter]);

  const currentWords = countWords(currentText);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`font-display text-2xl sm:text-3xl font-bold ${tokens.text}`}>
            My Library
          </h1>
          <p className={`mt-1 text-sm sm:text-base ${tokens.subtext}`}>
            Save passages locally, bookmark favorites, and resume reading right
            where you stopped. No sign-in needed.
          </p>
        </div>
      </div>

      {/* Save active text bar */}
      {currentWords > 0 && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between ${tokens.panelBg} ${tokens.border}`}
        >
          <div className="flex-1 space-y-1">
            <p className={`text-sm font-bold ${tokens.text}`}>
              Current active passage ({currentWords} words)
            </p>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Optional title (auto-generated if blank)"
              aria-label="Title for active passage"
              className={`w-full sm:max-w-md rounded-xl border px-3 py-2 text-sm min-h-[40px] ${tokens.input}`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onSaveCurrent(newTitle.trim() || undefined);
              setNewTitle('');
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 min-h-[44px] text-sm font-bold text-white hover:bg-teal-500 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Save active passage
          </button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${tokens.subtext}`}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved titles or text…"
            aria-label="Search library"
            className={`w-full rounded-xl border pl-10 pr-4 py-2.5 text-sm min-h-[44px] ${tokens.input}`}
          />
        </div>

        <div
          className={`inline-flex rounded-xl border p-1 self-start ${tokens.panelBg} ${tokens.border}`}
          role="group"
          aria-label="Filter library"
        >
          {(
            [
              ['all', 'All'],
              ['bookmarked', 'Bookmarked'],
              ['recent', 'Reading History'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3.5 py-1.5 min-h-[36px] text-sm font-semibold transition-colors whitespace-nowrap ${
                filter === id
                  ? 'bg-teal-600 text-white'
                  : tokens.dark
                    ? 'text-[#B8C5D9] hover:text-white'
                    : 'text-navy-700 hover:text-navy-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Items List */}
      {filtered.length === 0 ? (
        <div
          className={`rounded-3xl border p-10 text-center space-y-2 ${tokens.panelBg} ${tokens.border}`}
        >
          <p className={`text-base font-bold ${tokens.text}`}>
            {items.length === 0
              ? 'Your library is empty'
              : 'No matching passages found'}
          </p>
          <p className={`text-sm ${tokens.subtext}`}>
            {items.length === 0
              ? 'Save any text from Home, Scan Text, or Reading Studio to build your local reading library.'
              : 'Try a different search keyword or switch filters.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => {
            const pct =
              item.totalSentences > 0
                ? Math.min(
                    100,
                    Math.round(
                      ((item.progressSentenceIndex + 1) / item.totalSentences) *
                        100,
                    ),
                  )
                : 0;
            const isEditing = editingId === item.id;
            const isConfirmDelete = confirmDeleteId === item.id;

            return (
              <article
                key={item.id}
                className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 ${tokens.panelBg} ${tokens.border}`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div
                        className={`flex flex-wrap items-center gap-2 text-xs mb-1 tabular-nums ${tokens.subtext}`}
                      >
                        <span className="capitalize">{item.source}</span>
                        <span aria-hidden>·</span>
                        <span>{item.wordCount} words</span>
                        <span aria-hidden>·</span>
                        <span>
                          Opened {new Date(item.lastOpenedAt).toLocaleDateString()}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                onRenameItem(item.id, draftTitle);
                                setEditingId(null);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingId(null);
                              }
                            }}
                            aria-label="Rename passage"
                            className={`flex-1 rounded-lg border px-2.5 py-1.5 text-sm ${tokens.input}`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              onRenameItem(item.id, draftTitle);
                              setEditingId(null);
                            }}
                            aria-label="Save title"
                            className="rounded-lg bg-teal-600 p-2 text-white"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel rename"
                            className={`rounded-lg border p-2 ${tokens.secondaryBtn}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <h2 className={`text-lg font-bold truncate ${tokens.text}`}>
                          {item.title}
                        </h2>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(item.id)}
                        aria-label={
                          item.bookmarked ? 'Remove bookmark' : 'Bookmark passage'
                        }
                        title={item.bookmarked ? 'Bookmarked' : 'Bookmark'}
                        className={`rounded-lg border p-2 min-h-[36px] min-w-[36px] flex items-center justify-center ${
                          item.bookmarked
                            ? 'border-teal-500 bg-teal-600 text-white'
                            : tokens.secondaryBtn
                        }`}
                      >
                        <Bookmark className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setDraftTitle(item.title);
                        }}
                        aria-label="Rename passage"
                        title="Rename"
                        className={`rounded-lg border p-2 min-h-[36px] min-w-[36px] flex items-center justify-center ${tokens.secondaryBtn}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteId(isConfirmDelete ? null : item.id)
                        }
                        aria-label="Delete passage"
                        title="Delete"
                        className={`rounded-lg border p-2 min-h-[36px] min-w-[36px] flex items-center justify-center ${
                          tokens.dark
                            ? 'border-[#2D4366] bg-[#1A2D49] text-[#FF8A80]'
                            : 'border-cream-200 bg-white text-coral-600'
                        }`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className={`text-sm line-clamp-3 leading-relaxed ${tokens.subtext}`}>
                    {item.content}
                  </p>
                </div>

                {isConfirmDelete ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-coral-500/40 bg-coral-500/10 px-3 py-2 text-xs">
                    <span className="font-semibold text-coral-600">
                      Delete this passage?
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteItem(item.id);
                          setConfirmDeleteId(null);
                        }}
                        className="rounded-lg bg-coral-600 px-3 py-1.5 font-semibold text-white"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className={`rounded-lg border px-3 py-1.5 font-semibold ${tokens.secondaryBtn}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1 tabular-nums">
                        <span className={tokens.subtext}>
                          Sentence {item.progressSentenceIndex + 1} of{' '}
                          {item.totalSentences}
                        </span>
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
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenItem(item)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 min-h-[40px] text-sm font-semibold text-white hover:bg-teal-500 whitespace-nowrap"
                      >
                        <BookOpen className="h-4 w-4" aria-hidden />
                        Continue reading
                      </button>
                      <button
                        type="button"
                        onClick={() => onSendToAiTools(item)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2.5 min-h-[40px] text-sm font-semibold whitespace-nowrap ${tokens.secondaryBtn}`}
                      >
                        <Wand2 className="h-4 w-4 text-teal-600" aria-hidden />
                        AI Tools
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
