import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

const LANGUAGE_NAMES: Record<'en' | 'ta', string> = {
  en: 'English',
  ta: 'Tamil',
};

function isSupportedLang(code: string): code is 'en' | 'ta' {
  return code === 'en' || code === 'ta';
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 35000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms = 35000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Gemini request timed out after ${ms / 1000}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface ParsedGeminiError {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
}

function classifyGeminiError(err: unknown): ParsedGeminiError {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  let nestedCode: number | undefined;
  let nestedStatus = '';
  let nestedMessage = raw;

  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; status?: string; message?: string };
    };
    if (parsed?.error) {
      nestedCode = parsed.error.code;
      nestedStatus = parsed.error.status ?? '';
      nestedMessage = parsed.error.message ?? raw;
    }
  } catch {
    // raw message is plain text
  }

  const lower = `${nestedStatus} ${nestedMessage} ${raw}`.toLowerCase();

  if (
    nestedCode === 429 ||
    nestedStatus === 'RESOURCE_EXHAUSTED' ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return {
      status: 429,
      code: 'GEMINI_RATE_LIMIT',
      message:
        'Gemini API rate limit or quota reached right now. Wait a few seconds and retry, or use the Offline / Free alternative below.',
      retryable: !lower.includes('exceeded your current quota'),
    };
  }

  if (
    nestedCode === 503 ||
    nestedStatus === 'UNAVAILABLE' ||
    lower.includes('high demand') ||
    lower.includes('unavailable')
  ) {
    return {
      status: 503,
      code: 'GEMINI_UNAVAILABLE',
      message:
        'Gemini AI is temporarily experiencing high demand. Please retry in a few seconds, or use the Offline / Free alternative below.',
      retryable: true,
    };
  }

  if (
    nestedCode === 504 ||
    nestedStatus === 'DEADLINE_EXCEEDED' ||
    lower.includes('timed out') ||
    lower.includes('deadline')
  ) {
    return {
      status: 504,
      code: 'GEMINI_TIMEOUT',
      message:
        'Gemini AI took too long to respond for this passage. Try a shorter passage or use the Offline / Free alternative below.',
      retryable: true,
    };
  }

  if (
    nestedCode === 400 ||
    nestedCode === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('api key not valid')
  ) {
    return {
      status: nestedCode === 403 ? 403 : 400,
      code: 'GEMINI_KEY_ERROR',
      message:
        'The server Gemini API key is invalid or lacks permission. Check Settings > Secrets, or use the Offline / Free alternative below.',
      retryable: false,
    };
  }

  if (nestedCode === 404 || nestedStatus === 'NOT_FOUND') {
    return {
      status: 404,
      code: 'GEMINI_MODEL_ERROR',
      message: 'The configured Gemini model could not be found.',
      retryable: false,
    };
  }

  return {
    status: 502,
    code: 'GEMINI_ERROR',
    message:
      nestedMessage && nestedMessage.length < 240
        ? nestedMessage
        : 'Upstream Gemini AI request failed. Please try again or use the Offline / Free alternative below.',
    retryable: nestedCode !== undefined && nestedCode >= 500,
  };
}

async function callGeminiWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 2,
  timeoutMs = 35000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await withTimeout(operation(), timeoutMs);
    } catch (err) {
      lastError = err;
      const classified = classifyGeminiError(err);
      if (!classified.retryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 700 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function parseGeminiJson<T>(raw: string | undefined, fallback: T): T {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return fallback;
  return JSON.parse(cleaned) as T;
}

function splitForTranslation(text: string, maxChars = 420): string[] {
  const paragraphs = text.split(/\n+/);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      chunks.push(trimmed);
      continue;
    }

    const sentences = trimmed.match(/[^.!?]+[.!?]*\s*/g) ?? [trimmed];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length <= maxChars) {
        current += sentence;
      } else {
        if (current.trim()) chunks.push(current.trim());
        if (sentence.length <= maxChars) {
          current = sentence;
        } else {
          // Hard split very long clause at spaces
          const words = sentence.split(/\s+/);
          let part = '';
          for (const w of words) {
            if ((part + ' ' + w).trim().length <= maxChars) {
              part = (part + ' ' + w).trim();
            } else {
              if (part) chunks.push(part);
              part = w;
            }
          }
          current = part;
        }
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks;
}

async function translateViaMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const chunks = splitForTranslation(text, 420);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', chunk);
    url.searchParams.set('langpair', `${sourceLang}|${targetLang}`);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Translation service returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      responseStatus?: number;
      responseDetails?: string;
      responseData?: { translatedText?: string };
    };
    if (data.responseStatus && data.responseStatus !== 200) {
      throw new Error(data.responseDetails || 'Translation service error');
    }
    const out = data.responseData?.translatedText?.trim();
    if (!out) {
      throw new Error('Empty translation returned from provider');
    }
    if (/^MYMEMORY WARNING:/i.test(out) || /^PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(out)) {
      throw new Error(out);
    }
    translatedChunks.push(out);
  }

  return translatedChunks.join('\n\n');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/ai/status', (_req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    res.json({
      aiConfigured: Boolean(apiKey),
      model: MODEL_NAME,
    });
  });

  app.post('/api/ai/transform', async (req: Request, res: Response) => {
    const { text, task, targetWord } = (req.body ?? {}) as {
      text?: string;
      task?: string;
      targetWord?: string;
    };

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text input is required.' });
      return;
    }
    if (!task) {
      res.status(400).json({ error: 'Task is required.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        configured: false,
        error: 'AI_NOT_CONFIGURED',
        message:
          'Gemini AI is not configured on the server yet. Add GEMINI_API_KEY in AI Studio Settings > Secrets to enable AI-powered rewriting and comprehension generation.',
      });
      return;
    }

    const safeText = text.slice(0, 12000);

    try {
      if (task === 'comprehension') {
        const response = await callGeminiWithRetry(() =>
          ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Create 4 dyslexia-friendly reading comprehension questions based strictly on this passage:\n\n${safeText}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction:
                'You are a supportive reading tutor. Write clear, short, accessible questions with concise answers grounded strictly in the provided text.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    hint: { type: Type.STRING },
                  },
                  required: ['question', 'answer', 'hint'],
                },
              },
            },
          }),
        );
        const parsed = parseGeminiJson<
          Array<{ question: string; answer: string; hint: string }>
        >(response.text, []);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          res.status(502).json({
            error: 'GEMINI_EMPTY',
            message: 'Gemini returned no comprehension questions for this passage.',
          });
          return;
        }
        res.json({ provider: 'gemini', model: MODEL_NAME, task, questions: parsed });
        return;
      }

      if (task === 'explain-word' || task === 'synonyms') {
        const wordToAnalyze = (targetWord ?? '').trim();
        const prompt =
          task === 'explain-word'
            ? wordToAnalyze
              ? `Explain the word "${wordToAnalyze}" in very simple, friendly English as used in this passage:\n\n${safeText}`
              : `Identify up to 6 challenging or uncommon words in this passage and explain each in simple, friendly English:\n\n${safeText}`
            : wordToAnalyze
              ? `Provide 5-8 clear, easier synonyms for "${wordToAnalyze}" that fit its meaning in this passage:\n\n${safeText}`
              : `Pick up to 6 complex words from this passage and suggest simpler everyday synonyms for each:\n\n${safeText}`;

        const response = await callGeminiWithRetry(() =>
          ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction:
                'You are an accessibility reading assistant for readers with dyslexia. Keep definitions concise, concrete, and jargon-free.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    simpleMeaning: { type: Type.STRING },
                    synonyms: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['word', 'simpleMeaning', 'synonyms'],
                },
              },
            },
          }),
        );
        const items = parseGeminiJson<
          Array<{ word: string; simpleMeaning: string; synonyms: string[] }>
        >(response.text, []);
        if (!Array.isArray(items) || items.length === 0) {
          res.status(502).json({
            error: 'GEMINI_EMPTY',
            message: 'Gemini returned no word items for this passage.',
          });
          return;
        }
        res.json({ provider: 'gemini', model: MODEL_NAME, task, items });
        return;
      }

      if (task === 'key-points') {
        const response = await callGeminiWithRetry(() =>
          ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Extract 4 to 6 short, clear key bullet points from this passage:\n\n${safeText}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction:
                'Use plain, concrete language and short sentences suitable for readers with dyslexia.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          }),
        );
        const points = parseGeminiJson<string[]>(response.text, []);
        if (!Array.isArray(points) || points.length === 0) {
          res.status(502).json({
            error: 'GEMINI_EMPTY',
            message: 'Gemini returned no key points for this passage.',
          });
          return;
        }
        res.json({ provider: 'gemini', model: MODEL_NAME, task, points });
        return;
      }

      const prompts: Record<string, string> = {
        simplify: `Simplify the following passage into short, clear sentences with everyday words while keeping all key facts accurate:\n\n${safeText}`,
        'easier-english': `Rewrite the following passage in plain, easy-to-read English (around a 5th-grade reading level), breaking long ideas into short paragraphs:\n\n${safeText}`,
        summarize: `Write a clear, brief summary of this passage in 3 to 5 short sentences:\n\n${safeText}`,
        'paragraph-chunking': `Reorganize the following passage into short, well-spaced reading chunks of 2 to 3 sentences each with helpful plain-text section headings:\n\n${safeText}`,
      };

      const selectedPrompt = prompts[task];
      if (!selectedPrompt) {
        res.status(400).json({ error: `Unsupported AI task: ${task}` });
        return;
      }

      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: selectedPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You are a reading accessibility specialist. Return only the transformed readable text with clean paragraph spacing and no markdown clutter.',
          },
        }),
      );

      const textResult = (response.text ?? '').trim();
      if (!textResult) {
        res.status(502).json({
          error: 'GEMINI_EMPTY',
          message: 'Gemini returned an empty response. Please try again.',
        });
        return;
      }

      res.json({
        provider: 'gemini',
        model: MODEL_NAME,
        task,
        result: textResult,
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.code,
        message: classified.message,
      });
    }
  });

  app.post('/api/translate', async (req: Request, res: Response) => {
    const {
      text,
      sourceLang = 'en',
      targetLang = 'ta',
    } = (req.body ?? {}) as {
      text?: string;
      sourceLang?: string;
      targetLang?: string;
    };

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text to translate is required.' });
      return;
    }

    if (!isSupportedLang(sourceLang) || !isSupportedLang(targetLang)) {
      res.status(400).json({
        error: 'UNSUPPORTED_LANGUAGE',
        message: 'Translation currently supports only English (en) and Tamil (ta).',
      });
      return;
    }

    if (sourceLang === targetLang) {
      res.status(400).json({
        error: 'INVALID_DIRECTION',
        message: 'Choose opposite languages: English → Tamil or Tamil → English.',
      });
      return;
    }

    const safeText = text.slice(0, 8000);
    const ai = getGeminiClient();

    if (ai) {
      try {
        const sourceName = LANGUAGE_NAMES[sourceLang];
        const targetName = LANGUAGE_NAMES[targetLang];
        const response = await withTimeout(
          ai.models.generateContent({
            model: MODEL_NAME,
            contents: `Translate the following ${sourceName} text accurately into natural, clear ${targetName}. Preserve paragraph breaks and return only the translated text:\n\n${safeText}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          8000,
        );
        const translatedText = (response.text ?? '').trim();
        if (translatedText) {
          res.json({
            translatedText,
            provider: 'gemini',
            model: MODEL_NAME,
            sourceLang,
            targetLang,
          });
          return;
        }
      } catch {
        // Fall through to MyMemory free translation API if Gemini is unavailable
      }
    }

    try {
      const translatedText = await translateViaMyMemory(
        safeText,
        sourceLang,
        targetLang,
      );
      res.json({
        translatedText,
        provider: 'mymemory',
        sourceLang,
        targetLang,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Translation service is unavailable.';
      res.status(502).json({
        error: 'TRANSLATION_UNAVAILABLE',
        message: `Translation failed (${message}). Check internet connectivity or set GEMINI_API_KEY on the server (Settings > Secrets) to enable AI translation.`,
      });
    }
  });

  app.get('/api/dictionary', async (req: Request, res: Response) => {
    const rawWord = String(req.query.word ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z'-]/g, '');

    if (!rawWord) {
      res.status(400).json({ error: 'A valid English word is required.' });
      return;
    }

    try {
      const [dictRes, synRes] = await Promise.allSettled([
        fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(rawWord)}`,
          { signal: AbortSignal.timeout(7000) },
        ),
        fetch(
          `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(rawWord)}&max=10`,
          { signal: AbortSignal.timeout(7000) },
        ),
      ]);

      let phonetic = '';
      const meanings: Array<{
        partOfSpeech: string;
        definition: string;
        example?: string;
      }> = [];
      const synSet = new Set<string>();

      if (dictRes.status === 'fulfilled' && dictRes.value.ok) {
        const entries = (await dictRes.value.json()) as Array<{
          phonetic?: string;
          phonetics?: Array<{ text?: string }>;
          meanings?: Array<{
            partOfSpeech?: string;
            definitions?: Array<{
              definition?: string;
              example?: string;
              synonyms?: string[];
            }>;
            synonyms?: string[];
          }>;
        }>;
        const first = entries[0];
        if (first) {
          phonetic =
            first.phonetic ||
            first.phonetics?.find((p) => p.text)?.text ||
            '';
          for (const m of first.meanings ?? []) {
            for (const s of m.synonyms ?? []) synSet.add(s);
            for (const d of (m.definitions ?? []).slice(0, 2)) {
              if (d.definition) {
                meanings.push({
                  partOfSpeech: m.partOfSpeech ?? 'word',
                  definition: d.definition,
                  example: d.example,
                });
              }
              for (const s of d.synonyms ?? []) synSet.add(s);
            }
          }
        }
      }

      if (synRes.status === 'fulfilled' && synRes.value.ok) {
        const syns = (await synRes.value.json()) as Array<{ word?: string }>;
        for (const item of syns) {
          if (item.word) synSet.add(item.word);
        }
      }

      if (meanings.length === 0 && synSet.size === 0) {
        res.status(404).json({
          error: 'WORD_NOT_FOUND',
          message: `No dictionary entry found for "${rawWord}".`,
        });
        return;
      }

      res.json({
        word: rawWord,
        phonetic,
        meanings: meanings.slice(0, 4),
        synonyms: Array.from(synSet).slice(0, 10),
        provider: 'dictionaryapi.dev',
      });
    } catch (err) {
      res.status(502).json({
        error: 'DICTIONARY_UNAVAILABLE',
        message:
          err instanceof Error
            ? err.message
            : 'Could not reach dictionary service.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DylexiVision server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DylexiVision server:', err);
  process.exit(1);
});
