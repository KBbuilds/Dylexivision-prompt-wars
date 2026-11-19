import {
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import { SliderControl } from '@/components/Controls';
import type { SpeechController } from '@/hooks/useSpeech';
import { containsTamilScript } from '@/lib/languages';

interface SpeechPanelProps {
  text: string;
  sentences: string[];
  activeSentenceIndex: number;
  speech: SpeechController;
  dark: boolean;
}

export function SpeechPanel({
  text,
  sentences,
  activeSentenceIndex,
  speech,
  dark,
}: SpeechPanelProps) {
  const {
    supported,
    speaking,
    paused,
    rate,
    voices,
    tamilVoices,
    englishVoices,
    hasTamilVoice,
    voiceName,
    currentSentenceIndex,
    totalSentences,
    progressPercent,
    voiceWarning,
    playSentences,
    pause,
    resume,
    stop,
    restart,
    prevSentence,
    nextSentence,
    setRate,
    setVoiceName,
  } = speech;

  const panelClass = dark
    ? 'border-[#273B59] bg-[#142238] text-[#FAF6EC]'
    : 'border-cream-200 bg-cream-50 text-navy-900';
  const subTextClass = dark ? 'text-[#B8C5D9]' : 'text-navy-400';

  if (!supported) {
    return (
      <div className={`rounded-2xl p-5 border ${panelClass}`}>
        <h3 className="font-bold flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-teal-500" aria-hidden />
          Read aloud
        </h3>
        <p className={`mt-2 text-sm ${subTextClass}`}>
          Sorry, this browser does not support Web Speech synthesis. Try Chrome,
          Edge, or Safari.
        </p>
      </div>
    );
  }

  const empty = text.trim().length === 0 || sentences.length === 0;
  const isTamilPassage = containsTamilScript(text);
  const startFrom =
    activeSentenceIndex >= 0 && activeSentenceIndex < sentences.length
      ? activeSentenceIndex
      : 0;

  return (
    <div className={`rounded-2xl p-5 border ${panelClass} space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-teal-500" aria-hidden />
          Read aloud
        </h3>
        <div className="flex items-center gap-2">
          {!empty && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                dark
                  ? 'border-[#2D4366] bg-[#0F1B2E] text-[#D6E1F0]'
                  : 'border-cream-200 bg-white text-navy-700'
              }`}
            >
              {isTamilPassage ? 'தமிழ் · ta-IN' : 'English · en-US'}
            </span>
          )}
          {speaking && totalSentences > 0 && currentSentenceIndex !== null && (
            <span
              className={`text-xs font-semibold tabular-nums ${dark ? 'text-teal-400' : 'text-teal-600'}`}
            >
              {currentSentenceIndex + 1}/{totalSentences}
            </span>
          )}
        </div>
      </div>

      {/* Explicit warning when Tamil passage has no Tamil voice or when speech fails */}
      {isTamilPassage && !hasTamilVoice && !voiceWarning && voices.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-3.5 py-2.5 text-xs leading-relaxed flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
          <span>
            No Tamil (<code>ta-IN</code>) speech voice was detected on this
            device. English fallback is disabled for Tamil text.
          </span>
        </div>
      )}

      {voiceWarning && (
        <div
          role="alert"
          className="rounded-xl border border-coral-500/40 bg-coral-500/10 px-3.5 py-2.5 text-xs font-medium text-coral-600 leading-relaxed flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{voiceWarning}</span>
        </div>
      )}

      {speech.punctuationPauses && (
        <p className={`text-xs font-medium ${dark ? 'text-teal-300' : 'text-teal-700'}`}>
          Punctuation Focus: gentle sentence boundary pauses are enabled.
        </p>
      )}

      {/* Primary playback controls */}
      <div className="flex flex-wrap gap-2">
        {speaking && !paused ? (
          <button
            type="button"
            onClick={pause}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 min-h-[40px] text-sm font-semibold text-white hover:bg-teal-500 whitespace-nowrap"
          >
            <Pause className="h-4 w-4" aria-hidden />
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={
              speaking && paused
                ? resume
                : () => playSentences(sentences, startFrom)
            }
            disabled={empty}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 min-h-[40px] text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Play className="h-4 w-4" aria-hidden />
            {speaking && paused
              ? 'Resume'
              : startFrom > 0
                ? `Play from #${startFrom + 1}`
                : 'Play'}
          </button>
        )}

        <button
          type="button"
          onClick={stop}
          disabled={!speaking}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[40px] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${
            dark
              ? 'border-[#2D4366] bg-[#1A2D49] text-[#FF8A80] hover:border-coral-500'
              : 'border-cream-200 bg-white text-coral-600 hover:border-coral-500'
          }`}
          aria-label="Stop speech"
        >
          <Square className="h-3.5 w-3.5" aria-hidden />
          Stop
        </button>

        <button
          type="button"
          onClick={() => (speaking ? restart() : playSentences(sentences, 0))}
          disabled={empty}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[40px] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${
            dark
              ? 'border-[#2D4366] bg-[#1A2D49] text-[#FAF6EC] hover:border-teal-400'
              : 'border-cream-200 bg-white text-navy-800 hover:border-teal-500'
          }`}
          title="Restart from beginning"
          aria-label="Restart from beginning"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Restart
        </button>
      </div>

      {/* Sentence step controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={prevSentence}
          disabled={!speaking || (currentSentenceIndex ?? 0) <= 0}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 min-h-[38px] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
            dark
              ? 'border-[#2D4366] bg-[#1A2D49] text-[#FAF6EC] hover:border-teal-400'
              : 'border-cream-200 bg-white text-navy-800 hover:border-teal-500'
          }`}
        >
          <SkipBack className="h-3.5 w-3.5" aria-hidden />
          Prev sentence
        </button>
        <button
          type="button"
          onClick={nextSentence}
          disabled={
            !speaking ||
            (currentSentenceIndex ?? 0) >= Math.max(0, totalSentences - 1)
          }
          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 min-h-[38px] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
            dark
              ? 'border-[#2D4366] bg-[#1A2D49] text-[#FAF6EC] hover:border-teal-400'
              : 'border-cream-200 bg-white text-navy-800 hover:border-teal-500'
          }`}
        >
          Next sentence
          <SkipForward className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1 tabular-nums">
          <span className={subTextClass}>Playback progress</span>
          <span className={subTextClass}>{progressPercent}%</span>
        </div>
        <div
          className={`h-2 w-full rounded-full overflow-hidden ${dark ? 'bg-[#0F1B2E]' : 'bg-cream-200'}`}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-teal-600 transition-[width] duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <SliderControl
        label="Speech speed"
        value={rate}
        min={0.5}
        max={2}
        step={0.1}
        onChange={setRate}
        format={(v) => `${v.toFixed(1)}x`}
        dark={dark}
      />

      <label className="block">
        <span
          className={`mb-1.5 block text-sm font-medium ${dark ? 'text-[#E3ECF7]' : 'text-navy-700'}`}
        >
          Voice (English / Tamil)
        </span>
        <select
          value={voiceName}
          onChange={(e) => setVoiceName(e.target.value)}
          className={`w-full rounded-xl border px-3 py-2 text-sm min-h-[40px] focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
            dark
              ? 'border-[#2D4366] bg-[#0F1B2E] text-[#FAF6EC]'
              : 'border-cream-200 bg-white text-navy-900'
          }`}
        >
          <option value="">
            Auto ({isTamilPassage ? 'Tamil ta-IN' : 'English en-US'})
          </option>
          {tamilVoices.length > 0 && (
            <optgroup label="Tamil voices (ta-IN)">
              {tamilVoices.map((v) => (
                <option key={`${v.voiceURI}-${v.name}`} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </optgroup>
          )}
          {englishVoices.length > 0 && (
            <optgroup label="English voices">
              {englishVoices.map((v) => (
                <option key={`${v.voiceURI}-${v.name}`} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
    </div>
  );
}
