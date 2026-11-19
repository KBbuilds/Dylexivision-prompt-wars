import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { containsTamilScript, type SupportedLanguageCode } from '@/lib/languages';
import {
  detectSentenceEndPunctuation,
  parsePassage,
} from '@/lib/textProcessing';

export type WordSyncStatus = 'idle' | 'pending' | 'supported' | 'unsupported';

export interface SpeechController {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  rate: number;
  voices: SpeechSynthesisVoice[];
  tamilVoices: SpeechSynthesisVoice[];
  englishVoices: SpeechSynthesisVoice[];
  hasTamilVoice: boolean;
  voiceName: string;
  currentSentenceIndex: number | null;
  currentWordCharIndex: number | null;
  wordSyncStatus: WordSyncStatus;
  punctuationPauses: boolean;
  totalSentences: number;
  progressPercent: number;
  activeSpeechMode: 'passage' | 'translation' | null;
  activeLang: SupportedLanguageCode | null;
  voiceWarning: string | null;
  clearWarning: () => void;
  play: (text: string, startIndex?: number) => void;
  playSentences: (sentences: string[], startIndex?: number) => void;
  playFromWord: (
    sentences: string[],
    sentenceIndex: number,
    charOffset: number,
  ) => void;
  speakText: (text: string, preferredLang?: SupportedLanguageCode) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  restart: () => void;
  prevSentence: () => void;
  nextSentence: () => void;
  jumpToSentence: (index: number) => void;
  setRate: (rate: number) => void;
  setVoiceName: (name: string) => void;
  setPunctuationPauses: (enabled: boolean) => void;
}

const RATE_KEY = 'dylexivision-rate';
const VOICE_KEY = 'dylexivision-voice';

export function isTamilVoice(voice: SpeechSynthesisVoice): boolean {
  const lang = (voice.lang || '').toLowerCase();
  return (
    lang === 'ta' ||
    lang.startsWith('ta-') ||
    lang.startsWith('ta_') ||
    /tamil|தமிழ்/i.test(voice.name)
  );
}

export function isEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  const lang = (voice.lang || '').toLowerCase();
  return lang === 'en' || lang.startsWith('en-') || lang.startsWith('en_');
}

export function findCompatibleVoice(
  allVoices: SpeechSynthesisVoice[],
  targetLang: SupportedLanguageCode,
  preferredVoiceName: string,
): SpeechSynthesisVoice | null {
  if (targetLang === 'ta') {
    const tamilCandidates = allVoices.filter(isTamilVoice);
    if (tamilCandidates.length === 0) return null;

    if (preferredVoiceName) {
      const explicitTamil = tamilCandidates.find(
        (v) => v.name === preferredVoiceName,
      );
      if (explicitTamil) return explicitTamil;
    }

    return (
      tamilCandidates.find((v) => v.lang.toLowerCase() === 'ta-in') ??
      tamilCandidates.find((v) => v.lang.toLowerCase().startsWith('ta-')) ??
      tamilCandidates[0]
    );
  }

  const englishCandidates = allVoices.filter(isEnglishVoice);
  if (preferredVoiceName) {
    const explicitEnglish = englishCandidates.find(
      (v) => v.name === preferredVoiceName,
    );
    if (explicitEnglish) return explicitEnglish;
  }

  return (
    englishCandidates.find((v) => v.lang.toLowerCase() === 'en-us') ??
    englishCandidates.find((v) => v.lang.toLowerCase() === 'en-in') ??
    englishCandidates.find((v) => v.lang.toLowerCase() === 'en-gb') ??
    englishCandidates[0] ??
    allVoices.find((v) => !isTamilVoice(v) && v.default) ??
    allVoices.find((v) => !isTamilVoice(v)) ??
    null
  );
}

function loadNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function useSpeech(): SpeechController {
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [rate, setRateState] = useState(() => loadNumber(RATE_KEY, 1));
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceNameState] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number | null>(
    null,
  );
  const [currentWordCharIndex, setCurrentWordCharIndex] = useState<number | null>(
    null,
  );
  const [wordSyncStatus, setWordSyncStatus] = useState<WordSyncStatus>('idle');
  const [punctuationPauses, setPunctuationPausesState] = useState(false);
  const [totalSentences, setTotalSentences] = useState(0);
  const [activeSpeechMode, setActiveSpeechMode] = useState<
    'passage' | 'translation' | null
  >(null);
  const [activeLang, setActiveLang] = useState<SupportedLanguageCode | null>(
    null,
  );
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);

  const rateRef = useRef(rate);
  rateRef.current = rate;
  const voiceNameRef = useRef(voiceName);
  voiceNameRef.current = voiceName;
  const queueRef = useRef<string[]>([]);
  const indexRef = useRef<number>(0);
  const forcedLangRef = useRef<SupportedLanguageCode | null>(null);
  const sessionRef = useRef<number>(0);
  const speakingRef = useRef(false);
  speakingRef.current = speaking;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const wordSyncStatusRef = useRef<WordSyncStatus>(wordSyncStatus);
  wordSyncStatusRef.current = wordSyncStatus;
  const punctuationPausesRef = useRef(punctuationPauses);
  punctuationPausesRef.current = punctuationPauses;
  const utteranceBaseOffsetRef = useRef<number>(0);
  const lastCharOffsetRef = useRef<number>(0);
  const wordBoundarySeenRef = useRef<boolean>(false);

  // Prevent Chromium/Safari garbage collection from dropping utterance mid-sentence
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakTimerRef = useRef<number | null>(null);
  const boundaryDetectTimerRef = useRef<number | null>(null);

  const tamilVoices = useMemo(() => voices.filter(isTamilVoice), [voices]);
  const englishVoices = useMemo(() => voices.filter(isEnglishVoice), [voices]);
  const hasTamilVoice = tamilVoices.length > 0;

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;

    const update = () => {
      const all = synth.getVoices();
      setVoices(all);
      // Keep explicit selection only if it's an English or Tamil voice that still exists
      setVoiceNameState((current) => {
        if (
          current &&
          all.some(
            (v) => v.name === current && (isEnglishVoice(v) || isTamilVoice(v)),
          )
        ) {
          return current;
        }
        return '';
      });
    };
    update();
    synth.addEventListener('voiceschanged', update);
    return () => {
      synth.removeEventListener('voiceschanged', update);
      if (speakTimerRef.current !== null) {
        window.clearTimeout(speakTimerRef.current);
      }
      if (boundaryDetectTimerRef.current !== null) {
        window.clearTimeout(boundaryDetectTimerRef.current);
      }
      sessionRef.current += 1;
      activeUtteranceRef.current = null;
      synth.cancel();
    };
  }, [supported]);

  // Guard against Chromium pausing long speech sessions silently
  useEffect(() => {
    if (!supported || !speaking || paused) return;
    const interval = window.setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.speaking && synth.paused && !pausedRef.current) {
        synth.resume();
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [supported, speaking, paused]);

  const resetPlaybackState = useCallback(() => {
    if (boundaryDetectTimerRef.current !== null) {
      window.clearTimeout(boundaryDetectTimerRef.current);
      boundaryDetectTimerRef.current = null;
    }
    activeUtteranceRef.current = null;
    utteranceBaseOffsetRef.current = 0;
    lastCharOffsetRef.current = 0;
    wordBoundarySeenRef.current = false;
    setSpeaking(false);
    setPaused(false);
    setCurrentSentenceIndex(null);
    setCurrentWordCharIndex(null);
    setActiveSpeechMode(null);
    setActiveLang(null);
  }, []);

  const speakIndex = useCallback(
    (idx: number, sessionId: number, delayMs = 0, startCharOffset = 0) => {
      if (!supported) return;
      if (sessionId !== sessionRef.current) return;

      if (speakTimerRef.current !== null) {
        window.clearTimeout(speakTimerRef.current);
        speakTimerRef.current = null;
      }
      if (boundaryDetectTimerRef.current !== null) {
        window.clearTimeout(boundaryDetectTimerRef.current);
        boundaryDetectTimerRef.current = null;
      }

      const list = queueRef.current;
      if (idx < 0 || idx >= list.length) {
        resetPlaybackState();
        return;
      }

      const fullSentence = list[idx];
      const safeOffset = Math.max(
        0,
        Math.min(startCharOffset, Math.max(0, fullSentence.length - 1)),
      );
      const sentenceText =
        safeOffset > 0 ? fullSentence.slice(safeOffset) : fullSentence;
      const sentenceLang: SupportedLanguageCode =
        forcedLangRef.current ??
        (containsTamilScript(fullSentence) ? 'ta' : 'en');

      const allVoices = window.speechSynthesis.getVoices();
      const chosenVoice = findCompatibleVoice(
        allVoices,
        sentenceLang,
        voiceNameRef.current,
      );

      // Never silently read Tamil text with a wrong English voice
      if (sentenceLang === 'ta' && !chosenVoice) {
        window.speechSynthesis.cancel();
        resetPlaybackState();
        setVoiceWarning(
          'No Tamil (ta-IN) speech voice is installed on this browser or device. Rather than reading Tamil with an English voice, playback was stopped. Enable a Tamil Text-to-Speech voice in your system/browser settings (Chrome or Edge with Google/Microsoft Tamil voices) to hear Tamil aloud.',
        );
        return;
      }

      indexRef.current = idx;
      utteranceBaseOffsetRef.current = safeOffset;
      lastCharOffsetRef.current = safeOffset;
      wordBoundarySeenRef.current = false;
      setCurrentSentenceIndex(idx);
      setCurrentWordCharIndex(
        wordSyncStatusRef.current === 'supported' ? safeOffset : null,
      );
      setTotalSentences(list.length);
      setActiveLang(sentenceLang);

      const wordCount = (sentenceText.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).length;

      const triggerUtterance = () => {
        if (sessionId !== sessionRef.current) return;

        const utter = new SpeechSynthesisUtterance(sentenceText);
        utter.rate = rateRef.current;
        utter.lang = sentenceLang === 'ta' ? 'ta-IN' : 'en-US';
        if (chosenVoice) {
          utter.voice = chosenVoice;
          utter.lang = chosenVoice.lang || utter.lang;
        }

        utter.onstart = () => {
          if (sessionId !== sessionRef.current) return;
          if (wordSyncStatusRef.current === 'idle') {
            wordSyncStatusRef.current = 'pending';
            setWordSyncStatus('pending');
          }
          if (wordSyncStatusRef.current !== 'supported' && wordCount >= 2) {
            if (boundaryDetectTimerRef.current !== null) {
              window.clearTimeout(boundaryDetectTimerRef.current);
            }
            boundaryDetectTimerRef.current = window.setTimeout(() => {
              if (
                sessionId === sessionRef.current &&
                !pausedRef.current &&
                !wordBoundarySeenRef.current &&
                wordSyncStatusRef.current !== 'supported'
              ) {
                wordSyncStatusRef.current = 'unsupported';
                setWordSyncStatus('unsupported');
                setCurrentWordCharIndex(null);
              }
            }, 1500);
          }
        };

        utter.onboundary = (event) => {
          if (sessionId !== sessionRef.current) return;
          if (event.name === 'sentence') return;
          if (typeof event.charIndex !== 'number' || !Number.isFinite(event.charIndex)) {
            return;
          }
          if (boundaryDetectTimerRef.current !== null) {
            window.clearTimeout(boundaryDetectTimerRef.current);
            boundaryDetectTimerRef.current = null;
          }
          wordBoundarySeenRef.current = true;
          if (wordSyncStatusRef.current !== 'supported') {
            wordSyncStatusRef.current = 'supported';
            setWordSyncStatus('supported');
          }
          const absChar = utteranceBaseOffsetRef.current + event.charIndex;
          lastCharOffsetRef.current = absChar;
          setCurrentWordCharIndex(absChar);
        };

        utter.onend = () => {
          if (boundaryDetectTimerRef.current !== null) {
            window.clearTimeout(boundaryDetectTimerRef.current);
            boundaryDetectTimerRef.current = null;
          }
          if (sessionId !== sessionRef.current) return;
          if (
            wordCount >= 2 &&
            !wordBoundarySeenRef.current &&
            wordSyncStatusRef.current !== 'supported'
          ) {
            wordSyncStatusRef.current = 'unsupported';
            setWordSyncStatus('unsupported');
            setCurrentWordCharIndex(null);
          }
          activeUtteranceRef.current = null;
          let pauseDelay = 0;
          if (punctuationPausesRef.current) {
            const boundary = detectSentenceEndPunctuation(fullSentence);
            const basePause = boundary ? boundary.pauseMs : 220;
            pauseDelay = Math.round(
              basePause / Math.max(0.7, Math.min(1.5, rateRef.current)),
            );
          }
          speakIndex(idx + 1, sessionId, pauseDelay, 0);
        };

        utter.onerror = (event) => {
          if (boundaryDetectTimerRef.current !== null) {
            window.clearTimeout(boundaryDetectTimerRef.current);
            boundaryDetectTimerRef.current = null;
          }
          if (sessionId !== sessionRef.current) return;
          activeUtteranceRef.current = null;
          if (event.error === 'canceled' || event.error === 'interrupted') {
            return;
          }
          if (
            event.error === 'language-unavailable' ||
            event.error === 'voice-unavailable'
          ) {
            setVoiceWarning(
              sentenceLang === 'ta'
                ? 'Tamil (ta-IN) speech voice is unavailable on this browser/OS. Install a Tamil voice in your device TTS settings.'
                : 'Selected speech voice is unavailable on this browser/OS.',
            );
          } else {
            setVoiceWarning(
              `Speech playback failed (${event.error || 'audio error'}). Try stopping and restarting, or choose another compatible voice.`,
            );
          }
          resetPlaybackState();
        };

        activeUtteranceRef.current = utter;
        try {
          window.speechSynthesis.speak(utter);
        } catch {
          resetPlaybackState();
          setVoiceWarning('Could not start browser speech synthesis.');
        }
      };

      if (delayMs > 0) {
        speakTimerRef.current = window.setTimeout(triggerUtterance, delayMs);
      } else {
        triggerUtterance();
      }
    },
    [supported, resetPlaybackState],
  );

  const stop = useCallback(() => {
    if (!supported) return;
    sessionRef.current += 1;
    if (speakTimerRef.current !== null) {
      window.clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
    resetPlaybackState();
  }, [supported, resetPlaybackState]);

  const startQueue = useCallback(
    (
      sentences: string[],
      startIndex: number,
      mode: 'passage' | 'translation',
      preferredLang: SupportedLanguageCode | null,
      startCharOffset = 0,
    ) => {
      if (!supported) return;
      const clean = sentences.map((s) => s.trim()).filter(Boolean);
      if (clean.length === 0) return;

      const joined = clean.join(' ');
      const overallLang: SupportedLanguageCode =
        preferredLang ?? (containsTamilScript(joined) ? 'ta' : 'en');

      const allVoices = window.speechSynthesis.getVoices();
      if (
        overallLang === 'ta' &&
        !findCompatibleVoice(allVoices, 'ta', voiceNameRef.current)
      ) {
        sessionRef.current += 1;
        window.speechSynthesis.cancel();
        resetPlaybackState();
        setVoiceWarning(
          'No Tamil (ta-IN) speech voice was found on this browser/device. Reading Tamil with an English voice is disabled to avoid broken pronunciation. Install or enable a Tamil voice in your device TTS settings to use Tamil Read Aloud.',
        );
        return;
      }

      sessionRef.current += 1;
      const sid = sessionRef.current;
      window.speechSynthesis.cancel();

      queueRef.current = clean;
      forcedLangRef.current = preferredLang;
      setVoiceWarning(null);
      setActiveSpeechMode(mode);
      setActiveLang(overallLang);
      setSpeaking(true);
      setPaused(false);

      const safeStart = Math.max(0, Math.min(startIndex, clean.length - 1));
      // Brief 45ms delay prevents Chromium/Safari from silently dropping speech right after .cancel()
      speakIndex(safeStart, sid, 45, startCharOffset);
    },
    [supported, speakIndex, resetPlaybackState],
  );

  const playSentences = useCallback(
    (sentences: string[], startIndex = 0) => {
      startQueue(sentences, startIndex, 'passage', null, 0);
    },
    [startQueue],
  );

  const playFromWord = useCallback(
    (sentences: string[], sentenceIndex: number, charOffset: number) => {
      startQueue(sentences, sentenceIndex, 'passage', null, charOffset);
    },
    [startQueue],
  );

  const play = useCallback(
    (text: string, startIndex = 0) => {
      if (!text.trim()) return;
      const { sentences } = parsePassage(text);
      const list = sentences.map((s) => s.text);
      startQueue(list, startIndex, 'passage', null, 0);
    },
    [startQueue],
  );

  const speakText = useCallback(
    (text: string, preferredLang?: SupportedLanguageCode) => {
      if (!text.trim()) return;
      const detected =
        preferredLang ?? (containsTamilScript(text) ? 'ta' : 'en');
      const { sentences } = parsePassage(text);
      const list = sentences.map((s) => s.text);
      startQueue(
        list.length > 0 ? list : [text.trim()],
        0,
        'translation',
        detected,
        0,
      );
    },
    [startQueue],
  );

  const pause = useCallback(() => {
    if (!supported || !speakingRef.current || pausedRef.current) return;
    if (boundaryDetectTimerRef.current !== null) {
      window.clearTimeout(boundaryDetectTimerRef.current);
      boundaryDetectTimerRef.current = null;
    }
    window.speechSynthesis.pause();
    setPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported || !speakingRef.current) return;
    window.speechSynthesis.resume();
    setPaused(false);
    // Recover cleanly if the browser dropped the paused utterance queue
    if (!window.speechSynthesis.speaking && queueRef.current.length > 0) {
      sessionRef.current += 1;
      const sid = sessionRef.current;
      speakIndex(indexRef.current, sid, 45, lastCharOffsetRef.current);
    }
  }, [supported, speakIndex]);

  const jumpToSentence = useCallback(
    (index: number) => {
      if (!supported || queueRef.current.length === 0) return;
      const safeIndex = Math.max(
        0,
        Math.min(index, queueRef.current.length - 1),
      );
      sessionRef.current += 1;
      const sid = sessionRef.current;
      window.speechSynthesis.cancel();
      setVoiceWarning(null);
      setSpeaking(true);
      setPaused(false);
      speakIndex(safeIndex, sid, 45, 0);
    },
    [supported, speakIndex],
  );

  const restart = useCallback(() => {
    if (queueRef.current.length === 0) return;
    jumpToSentence(0);
  }, [jumpToSentence]);

  const prevSentence = useCallback(() => {
    if (queueRef.current.length === 0) return;
    jumpToSentence(Math.max(0, indexRef.current - 1));
  }, [jumpToSentence]);

  const nextSentence = useCallback(() => {
    if (queueRef.current.length === 0) return;
    jumpToSentence(
      Math.min(queueRef.current.length - 1, indexRef.current + 1),
    );
  }, [jumpToSentence]);

  const setRate = useCallback(
    (r: number) => {
      setRateState(r);
      rateRef.current = r;
      try {
        localStorage.setItem(RATE_KEY, String(r));
      } catch {
        // ignore
      }
      if (supported && speakingRef.current && !pausedRef.current) {
        sessionRef.current += 1;
        const sid = sessionRef.current;
        window.speechSynthesis.cancel();
        speakIndex(indexRef.current, sid, 45, lastCharOffsetRef.current);
      }
    },
    [supported, speakIndex],
  );

  const setVoiceName = useCallback(
    (name: string) => {
      setVoiceNameState(name);
      voiceNameRef.current = name;
      setVoiceWarning(null);
      wordSyncStatusRef.current = 'idle';
      setWordSyncStatus('idle');
      setCurrentWordCharIndex(null);
      try {
        localStorage.setItem(VOICE_KEY, name);
      } catch {
        // ignore
      }
      if (supported && speakingRef.current && !pausedRef.current) {
        sessionRef.current += 1;
        const sid = sessionRef.current;
        window.speechSynthesis.cancel();
        speakIndex(indexRef.current, sid, 45, lastCharOffsetRef.current);
      }
    },
    [supported, speakIndex],
  );

  const setPunctuationPauses = useCallback((enabled: boolean) => {
    punctuationPausesRef.current = enabled;
    setPunctuationPausesState(enabled);
  }, []);

  const clearWarning = useCallback(() => {
    setVoiceWarning(null);
  }, []);

  const progressPercent =
    totalSentences > 0 && currentSentenceIndex !== null
      ? Math.round(((currentSentenceIndex + 1) / totalSentences) * 100)
      : 0;

  return {
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
    currentWordCharIndex,
    wordSyncStatus,
    punctuationPauses,
    totalSentences,
    progressPercent,
    activeSpeechMode,
    activeLang,
    voiceWarning,
    clearWarning,
    play,
    playSentences,
    playFromWord,
    speakText,
    pause,
    resume,
    stop,
    restart,
    prevSentence,
    nextSentence,
    jumpToSentence,
    setRate,
    setVoiceName,
    setPunctuationPauses,
  };
}
