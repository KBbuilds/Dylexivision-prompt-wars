import { RotateCcw } from 'lucide-react';
import { SliderControl } from '@/components/Controls';
import {
  FONT_OPTIONS,
  LIMITS,
  READING_MODES,
  THEME_PRESETS,
  type ReadingSettings,
  type ReadingWidth,
  type RulerColor,
  type RulerFocusArea,
  type TextAlignment,
  type ThemeStyleTokens,
} from '@/settings';

interface SettingsPageProps {
  settings: ReadingSettings;
  onSettingsChange: (patch: Partial<ReadingSettings>) => void;
  onResetAll: () => void;
  tokens: ThemeStyleTokens;
}

export function SettingsPage({
  settings,
  onSettingsChange,
  onResetAll,
  tokens,
}: SettingsPageProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`font-display text-2xl sm:text-3xl font-bold ${tokens.text}`}>
            Accessibility & Reading Settings
          </h1>
          <p className={`mt-1 text-sm sm:text-base ${tokens.subtext}`}>
            All changes save automatically in your browser and apply across
            Reading Studio.
          </p>
        </div>

        <button
          type="button"
          onClick={onResetAll}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 min-h-[44px] text-sm font-semibold self-start ${tokens.secondaryBtn}`}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Reset defaults
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Typography */}
        <section
          aria-label="Typography settings"
          className={`rounded-3xl border p-5 sm:p-6 space-y-4 ${tokens.panelBg} ${tokens.border}`}
        >
          <h2 className={`text-lg font-bold ${tokens.text}`}>Typography</h2>

          <label className="block">
            <span
              className={`mb-1.5 block text-sm font-medium ${tokens.dark ? 'text-[#E3ECF7]' : 'text-navy-700'}`}
            >
              Font family
            </span>
            <select
              value={settings.fontFamily}
              onChange={(e) =>
                onSettingsChange({ fontFamily: e.target.value })
              }
              className={`w-full rounded-xl border px-3 py-2.5 text-sm min-h-[42px] ${tokens.input}`}
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
            dark={tokens.dark}
          />
          <SliderControl
            label="Letter spacing"
            value={settings.letterSpacing}
            min={LIMITS.letterSpacing.min}
            max={LIMITS.letterSpacing.max}
            step={LIMITS.letterSpacing.step}
            onChange={(v) => onSettingsChange({ letterSpacing: v })}
            format={(v) => `${v}px`}
            dark={tokens.dark}
          />
          <SliderControl
            label="Word spacing"
            value={settings.wordSpacing}
            min={LIMITS.wordSpacing.min}
            max={LIMITS.wordSpacing.max}
            step={LIMITS.wordSpacing.step}
            onChange={(v) => onSettingsChange({ wordSpacing: v })}
            format={(v) => `${v}px`}
            dark={tokens.dark}
          />
          <SliderControl
            label="Line spacing"
            value={settings.lineHeight}
            min={LIMITS.lineHeight.min}
            max={LIMITS.lineHeight.max}
            step={LIMITS.lineHeight.step}
            onChange={(v) => onSettingsChange({ lineHeight: v })}
            format={(v) => `${v.toFixed(1)}x`}
            dark={tokens.dark}
          />
          <SliderControl
            label="Paragraph spacing"
            value={settings.paragraphSpacing}
            min={LIMITS.paragraphSpacing.min}
            max={LIMITS.paragraphSpacing.max}
            step={LIMITS.paragraphSpacing.step}
            onChange={(v) => onSettingsChange({ paragraphSpacing: v })}
            format={(v) => `${v.toFixed(1)}em`}
            dark={tokens.dark}
          />
        </section>

        {/* Layout, Themes & Colors */}
        <section
          aria-label="Themes and page layout"
          className={`rounded-3xl border p-5 sm:p-6 space-y-5 ${tokens.panelBg} ${tokens.border}`}
        >
          <h2 className={`text-lg font-bold ${tokens.text}`}>
            Themes & Layout
          </h2>

          <div>
            <p className={`text-sm font-medium mb-2 ${tokens.text}`}>
              Color theme preset
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {THEME_PRESETS.map((preset) => {
                const active = settings.theme === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      onSettingsChange({
                        theme: preset.id,
                        customBgColor: null,
                        customTextColor: null,
                      })
                    }
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 min-h-[42px] text-xs font-semibold text-left ${
                      active
                        ? 'border-teal-500 ring-2 ring-teal-500/30'
                        : tokens.border
                    }`}
                    style={{
                      backgroundColor: preset.swatchBg,
                      color: preset.swatchText,
                    }}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-current shrink-0"
                      aria-hidden
                    />
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
                Custom text color
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
              <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
                Custom background
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

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
                Reading width
              </span>
              <select
                value={settings.readingWidth}
                onChange={(e) =>
                  onSettingsChange({
                    readingWidth: e.target.value as ReadingWidth,
                  })
                }
                className={`w-full rounded-xl border px-3 py-2 text-sm min-h-[40px] ${tokens.input}`}
              >
                <option value="narrow">Narrow (52ch)</option>
                <option value="medium">Medium (66ch)</option>
                <option value="wide">Wide (82ch)</option>
                <option value="full">Full width</option>
              </select>
            </label>

            <label className="block">
              <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
                Alignment
              </span>
              <select
                value={settings.textAlign}
                onChange={(e) =>
                  onSettingsChange({
                    textAlign: e.target.value as TextAlignment,
                  })
                }
                className={`w-full rounded-xl border px-3 py-2 text-sm min-h-[40px] ${tokens.input}`}
              >
                <option value="left">Left aligned (recommended)</option>
                <option value="center">Centered</option>
                <option value="justify">Justified</option>
              </select>
            </label>
          </div>

          <SliderControl
            label="Horizontal page margins"
            value={settings.marginX}
            min={LIMITS.marginX.min}
            max={LIMITS.marginX.max}
            step={LIMITS.marginX.step}
            onChange={(v) => onSettingsChange({ marginX: v })}
            format={(v) => `${v}px`}
            dark={tokens.dark}
          />
        </section>

        {/* Reading Modes, Ruler & Motion */}
        <section
          aria-label="Reading aids and motion"
          className={`rounded-3xl border p-5 sm:p-6 space-y-4 ${tokens.panelBg} ${tokens.border}`}
        >
          <h2 className={`text-lg font-bold ${tokens.text}`}>
            Reading Aids & Motion
          </h2>

          <label className="block">
            <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
              Default reading mode
            </span>
            <select
              value={settings.readingMode}
              onChange={(e) =>
                onSettingsChange({
                  readingMode: e.target.value as ReadingSettings['readingMode'],
                })
              }
              className={`w-full rounded-xl border px-3 py-2.5 text-sm min-h-[42px] ${tokens.input}`}
            >
              {READING_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.bionicReading}
                onChange={(e) =>
                  onSettingsChange({ bionicReading: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                Enable Bionic reading emphasis
              </span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.punctuationFocus}
                onChange={(e) =>
                  onSettingsChange({ punctuationFocus: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                Enable Punctuation Focus
              </span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.mirrorLetterAlert}
                onChange={(e) =>
                  onSettingsChange({ mirrorLetterAlert: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                Mirror Letter Alert (b/d, p/q, m/w)
              </span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.englishSyllables}
                onChange={(e) =>
                  onSettingsChange({ englishSyllables: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                English Syllable Reading divisions
              </span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.tamilSyllableGrouping}
                onChange={(e) =>
                  onSettingsChange({ tamilSyllableGrouping: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                Tamil Sound Grouping (தமிழ் அசைப் பிரிப்பு)
              </span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.tamilVowelHighlight}
                onChange={(e) =>
                  onSettingsChange({ tamilVowelHighlight: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                Tamil Vowel Marker Highlighting (உயிர்மெய் குறியீடுகள்)
              </span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.rulerEnabled}
                onChange={(e) =>
                  onSettingsChange({ rulerEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                Enable Reading Ruler
              </span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[40px]">
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) =>
                  onSettingsChange({ reducedMotion: e.target.checked })
                }
                className="h-4 w-4 accent-teal-600"
              />
              <span className={`text-sm font-medium ${tokens.text}`}>
                Reduce motion & animations
              </span>
            </label>
          </div>

          <SliderControl
            label="Chunk size (sentences per chunk)"
            value={settings.chunkSize}
            min={LIMITS.chunkSize.min}
            max={LIMITS.chunkSize.max}
            step={LIMITS.chunkSize.step}
            onChange={(v) => onSettingsChange({ chunkSize: v })}
            format={(v) => `${v} sentences`}
            dark={tokens.dark}
          />

          <SliderControl
            label="Ruler height"
            value={settings.rulerHeight}
            min={LIMITS.rulerHeight.min}
            max={LIMITS.rulerHeight.max}
            step={LIMITS.rulerHeight.step}
            onChange={(v) => onSettingsChange({ rulerHeight: v })}
            format={(v) => `${v}px`}
            dark={tokens.dark}
          />

          <SliderControl
            label="Focus mask opacity"
            value={settings.rulerOpacity}
            min={LIMITS.rulerOpacity.min}
            max={LIMITS.rulerOpacity.max}
            step={LIMITS.rulerOpacity.step}
            onChange={(v) => onSettingsChange({ rulerOpacity: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            dark={tokens.dark}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
                Ruler tint
              </span>
              <select
                value={settings.rulerColor}
                onChange={(e) =>
                  onSettingsChange({ rulerColor: e.target.value as RulerColor })
                }
                className={`w-full rounded-xl border px-3 py-2 text-sm min-h-[40px] ${tokens.input}`}
              >
                <option value="teal">Teal</option>
                <option value="amber">Warm Amber</option>
                <option value="blue">Soft Blue</option>
                <option value="rose">Coral Rose</option>
                <option value="neutral">Neutral Gray</option>
              </select>
            </label>

            <label className="block">
              <span className={`block text-xs font-semibold mb-1 ${tokens.subtext}`}>
                Focus area band
              </span>
              <select
                value={settings.rulerFocusArea}
                onChange={(e) =>
                  onSettingsChange({
                    rulerFocusArea: e.target.value as RulerFocusArea,
                  })
                }
                className={`w-full rounded-xl border px-3 py-2 text-sm min-h-[40px] ${tokens.input}`}
              >
                <option value="narrow">Narrow strip</option>
                <option value="medium">Medium strip</option>
                <option value="wide">Wide strip</option>
              </select>
            </label>
          </div>
        </section>

        {/* Keyboard Shortcuts Reference */}
        <section
          aria-label="Keyboard shortcuts"
          className={`rounded-3xl border p-5 sm:p-6 space-y-4 ${tokens.panelBg} ${tokens.border}`}
        >
          <h2 className={`text-lg font-bold ${tokens.text}`}>
            Keyboard Navigation in Studio
          </h2>
          <dl className="space-y-2.5 text-sm">
            {[
              ['↑ / ↓ (or J / K)', 'Move Reading Ruler or step sentences'],
              ['← / →', 'Previous / Next sentence or reading chunk'],
              ['Space', 'Play or Pause speech playback'],
              ['F', 'Toggle distraction-free Focus Mode'],
              ['R', 'Toggle Reading Ruler'],
              ['B', 'Toggle Bionic Reading'],
              ['P', 'Toggle Punctuation Focus'],
              ['Esc', 'Exit Focus Mode back to standard studio'],
            ].map(([keys, desc]) => (
              <div
                key={keys}
                className={`flex items-center justify-between gap-4 border-b pb-2 last:border-b-0 ${tokens.border}`}
              >
                <dt className={`font-semibold ${tokens.text}`}>{keys}</dt>
                <dd className={`text-right ${tokens.subtext}`}>{desc}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
