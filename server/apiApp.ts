import express, { type Express, type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export const MODEL_NAME = 'gemini-4-hydrogen';
export const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

const LANGUAGE_NAMES: Record<'en' | 'ta', string> = {
  en: 'English',
  ta: 'Tamil',
};

function isSupportedLang(code: string): code is 'en' | 'ta' {
  return code === 'en' || code === 'ta';
}

function getConfiguredApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    undefined
  );
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 22000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
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
    lower.includes('api key not valid') ||
    lower.includes('no api key')
  ) {
    return {
      status: nestedCode === 403 ? 403 : 400,
      code: 'GEMINI_KEY_ERROR',
      message:
        'The server Gemini API key is missing, invalid, or lacks permission. Set GEMINI_API_KEY in Settings > Secrets (or Vercel Environment Variables), or use the Offline / Free alternative below.',
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

let primaryCooldownUntil = 0;

async function callGeminiWithFallback<T>(
  operation: (model: string, thinkingLevel: ThinkingLevel) => Promise<T>,
  timeoutMs = 20000,
): Promise<{ result: T; modelUsed: string }> {
  const inCooldown = Date.now() < primaryCooldownUntil;
  const primaryTimeout = Math.min(timeoutMs, 11000);
  const attempts: Array<{
    model: string;
    thinkingLevel: ThinkingLevel;
    ms: number;
    backoffMs: number;
  }> = inCooldown
    ? [
        {
          model: FALLBACK_MODEL_NAME,
          thinkingLevel: ThinkingLevel.MINIMAL,
          ms: timeoutMs,
          backoffMs: 700,
        },
        {
          model: FALLBACK_MODEL_NAME,
          thinkingLevel: ThinkingLevel.MINIMAL,
          ms: timeoutMs,
          backoffMs: 0,
        },
      ]
    : [
        {
          model: MODEL_NAME,
          thinkingLevel: ThinkingLevel.LOW,
          ms: primaryTimeout,
          backoffMs: 250,
        },
        {
          model: FALLBACK_MODEL_NAME,
          thinkingLevel: ThinkingLevel.MINIMAL,
          ms: timeoutMs,
          backoffMs: 700,
        },
        {
          model: FALLBACK_MODEL_NAME,
          thinkingLevel: ThinkingLevel.MINIMAL,
          ms: timeoutMs,
          backoffMs: 0,
        },
      ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i += 1) {
    const { model, thinkingLevel, ms, backoffMs } = attempts[i];
    try {
      const result = await withTimeout(operation(model, thinkingLevel), ms);
      return { result, modelUsed: model };
    } catch (err) {
      lastError = err;
      const classified = classifyGeminiError(err);
      const canFallback = classified.retryable || classified.status === 429;
      if (!canFallback || i === attempts.length - 1) {
        throw err;
      }
      if (model === MODEL_NAME) {
        primaryCooldownUntil = Date.now() + 180_000;
      }
      if (backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
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
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
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

    const sentences =
      trimmed.match(/(?:[^.!?]|[.!?](?!["'”’)\]]*(?:\s|$)))+(?:[.!?]+["'”’)\]]*)?\s*/g) ??
      [trimmed];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length <= maxChars) {
        current += sentence;
      } else {
        if (current.trim()) chunks.push(current.trim());
        if (sentence.length <= maxChars) {
          current = sentence;
        } else {
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

function containsTamil(text: string): boolean {
  return /[\u0B80-\u0BFF]/.test(text);
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/ai/status', (_req: Request, res: Response) => {
    const apiKey = getConfiguredApiKey();
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
          'Gemini AI is not configured on the server yet. Set GEMINI_API_KEY in Settings > Secrets (or Vercel Environment Variables) to enable AI-powered rewriting and comprehension generation.',
      });
      return;
    }

    const safeText = text.slice(0, 12000);
    const isTamilPassage = containsTamil(safeText) || containsTamil(targetWord ?? '');

    try {
      if (task === 'comprehension') {
        const prompt = isTamilPassage
          ? `இந்த தமிழ் உரைப்பகுதியின் அடிப்படையில் வாசிப்பு புரிதலை சோதிக்கும் 4 எளிய கேள்விகள், குறுகிய பதில்கள் மற்றும் குறிப்புகளை (hints) எளிய தமிழில் உருவாக்கவும்:\n\n${safeText}`
          : `Create 4 dyslexia-friendly reading comprehension questions based strictly on this passage:\n\n${safeText}`;

        const { result: response, modelUsed } = await callGeminiWithFallback(
          (model, thinkingLevel) =>
            ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                thinkingConfig: { thinkingLevel },
                systemInstruction: isTamilPassage
                  ? 'நீங்கள் ஒரு தமிழ் வாசிப்பு உதவியாளர். கொடுக்கப்பட்ட தமிழ் உரைக்கு மட்டுமே ஏற்ப எளிய தமிழில் குறுகிய கேள்விகள், துல்லியமான பதில்கள் மற்றும் குறிப்புகளை வழங்கவும். தமிழ் எழுத்துக்களைச் சிதைக்காதீர்கள்.'
                  : 'You are a supportive reading tutor. Write clear, short, accessible questions with concise answers grounded strictly in the provided text.',
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
          22000,
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
        res.json({ provider: 'gemini', model: modelUsed, task, questions: parsed });
        return;
      }

      if (task === 'explain-word' || task === 'synonyms') {
        const wordToAnalyze = (targetWord ?? '').trim();
        const wordIsTamil = containsTamil(wordToAnalyze || safeText);

        const prompt = wordIsTamil
          ? task === 'explain-word'
            ? wordToAnalyze
              ? `"${wordToAnalyze}" என்ற தமிழ் சொல்லின் பொருளை இந்த உரையின் சூழலுக்கு ஏற்ப மிக எளிய தமிழில் விளக்கவும் மற்றும் எளிய தமிழ் மாற்றுச் சொற்களையும் வழங்கவும்:\n\n${safeText}`
              : `இந்த தமிழ் உரையில் உள்ள 6 கடினமான அல்லது முக்கியமான சொற்களைத் தேர்ந்தெடுத்து, ஒவ்வொன்றிற்கும் எளிய தமிழ் விளக்கம் மற்றும் எளிய தமிழ் மாற்றுச் சொற்கள் வழங்கவும்:\n\n${safeText}`
            : wordToAnalyze
              ? `"${wordToAnalyze}" என்ற தமிழ் சொல்லுக்கு இந்த உரையின் பொருளுக்கு ஏற்ற 4 முதல் 6 எளிய தமிழ் மாற்றுச் சொற்கள் (synonyms) மற்றும் குறுகிய பொருள் வழங்கவும்:\n\n${safeText}`
              : `இந்த தமிழ் உரையிலிருந்து 6 கடினமான சொற்களைத் தேர்ந்தெடுத்து, ஒவ்வொன்றிற்கும் எளிய தமிழ் மாற்றுச் சொற்கள் (synonyms) மற்றும் பொருள் வழங்கவும்:\n\n${safeText}`
          : task === 'explain-word'
            ? wordToAnalyze
              ? `Explain the word "${wordToAnalyze}" in very simple, friendly English as used in this passage:\n\n${safeText}`
              : `Identify up to 6 challenging or uncommon words in this passage and explain each in simple, friendly English:\n\n${safeText}`
            : wordToAnalyze
              ? `Provide 5-8 clear, easier synonyms for "${wordToAnalyze}" that fit its meaning in this passage:\n\n${safeText}`
              : `Pick up to 6 complex words from this passage and suggest simpler everyday synonyms for each:\n\n${safeText}`;

        const { result: response, modelUsed } = await callGeminiWithFallback(
          (model, thinkingLevel) =>
            ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                thinkingConfig: { thinkingLevel },
                systemInstruction: wordIsTamil
                  ? 'நீங்கள் தமிழ் வாசிப்பு உதவியாளர். அசல் தமிழ் சொல்லை word புலத்தில் அப்படியே வைத்து, simpleMeaning மற்றும் synonyms புலங்களில் எளிய, இயல்பான தமிழ் விளக்கங்களையும் மாற்றுச் சொற்களையும் வழங்கவும்.'
                  : 'You are an accessibility reading assistant for readers with dyslexia. Keep definitions concise, concrete, and jargon-free.',
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
        res.json({ provider: 'gemini', model: modelUsed, task, items });
        return;
      }

      if (task === 'key-points') {
        const prompt = isTamilPassage
          ? `இந்த தமிழ் உரையிலிருந்து 4 முதல் 6 முக்கியமான கருத்துகளை குறுகிய, எளிய தமிழ் வாக்கியங்களாக பிரித்துத் தரவும்:\n\n${safeText}`
          : `Extract 4 to 6 short, clear key bullet points from this passage:\n\n${safeText}`;

        const { result: response, modelUsed } = await callGeminiWithFallback(
          (model, thinkingLevel) =>
            ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                thinkingConfig: { thinkingLevel },
                systemInstruction: isTamilPassage
                  ? 'அசல் தமிழ் உரையின் மொழியிலேயே (தமிழ்) எளிய, குறுகிய வாக்கியங்களாக முக்கிய கருத்துகளை வழங்கவும்.'
                  : 'Use plain, concrete language and short sentences suitable for readers with dyslexia.',
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
        res.json({ provider: 'gemini', model: modelUsed, task, points });
        return;
      }

      const prompts: Record<string, string> = isTamilPassage
        ? {
            simplify: `பின்வரும் தமிழ் உரையின் பொருளும் முக்கிய தகவல்களும் மாறாமல், கடினமான சொற்களை எளிய தமிழ்ச் சொற்களாக மாற்றி, குறுகிய தெளிவான வாக்கியங்களாக எளிமைப்படுத்தவும்:\n\n${safeText}`,
            'easier-english': `பின்வரும் தமிழ் உரையை எளிய தமிழில் (அன்றாடப் பேச்சுக்கு நெருக்கமான தெளிவான தமிழ், குறுகிய வாக்கியங்கள் மற்றும் சிறிய பத்திகள்) மீண்டும் எழுதவும். ஆங்கிலத்திற்கு மொழிபெயர்க்க வேண்டாம்:\n\n${safeText}`,
            summarize: `பின்வரும் தமிழ் உரையின் சுருக்கத்தை 3 முதல் 5 குறுகிய, எளிய தமிழ் வாக்கியங்களில் எழுதவும்:\n\n${safeText}`,
            'paragraph-chunking': `பின்வரும் தமிழ் உரையை வாசிக்க எளிதாக 2 முதல் 3 வாக்கியங்கள் கொண்ட சிறிய பகுதிகளாகப் பிரித்து, ஒவ்வொன்றிற்கும் எளிய தமிழ் தலைப்புகளைக் கொடுக்கவும்:\n\n${safeText}`,
          }
        : {
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

      const { result: response, modelUsed } = await callGeminiWithFallback(
        (model, thinkingLevel) =>
          ai.models.generateContent({
            model,
            contents: selectedPrompt,
            config: {
              thinkingConfig: { thinkingLevel },
              systemInstruction: isTamilPassage
                ? 'நீங்கள் தமிழ் வாசிப்பு அணுகல்தன்மை நிபுணர். உள்ளீடு தமிழில் இருந்தால் பதிலையும் தெளிவான தமிழ் Unicode-ல் மட்டுமே வழங்கவும். Markdown குறியீடுகள் இல்லாமல் சுத்தமான பத்திகளாகத் தரவும்.'
                : 'You are a reading accessibility specialist. Return only the transformed readable text with clean paragraph spacing and no markdown clutter.',
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
        model: modelUsed,
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

  // Multimodal Vision OCR (supports Printed + Handwritten English, Tamil, and Mixed Tamil+English)
  app.post('/api/ocr', async (req: Request, res: Response) => {
    const { imageBase64, mimeType = 'image/jpeg', languageHint } = (req.body ?? {}) as {
      imageBase64?: string;
      mimeType?: string;
      languageHint?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Image payload is required.' });
      return;
    }

    const cleanedBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    if (!cleanedBase64 || cleanedBase64.length > 7_500_000) {
      res.status(400).json({ error: 'Image is missing or exceeds maximum size.' });
      return;
    }

    const safeMime =
      mimeType === 'image/png' || mimeType === 'image/webp' || mimeType === 'image/jpeg'
        ? mimeType
        : 'image/jpeg';

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        configured: false,
        error: 'AI_NOT_CONFIGURED',
        message:
          'Vision AI OCR is not configured on the server. Falling back to local browser OCR for printed text.',
      });
      return;
    }

    const hintLine =
      languageHint === 'tam'
        ? 'The user also indicated Tamil may be present, though transcribe any English words accurately too.'
        : languageHint === 'tam+eng'
          ? 'The user indicated both Tamil and English may appear.'
          : 'Automatically detect whether the image contains English, Tamil, or mixed Tamil + English.';

    try {
      const { result: response, modelUsed } = await callGeminiWithFallback(
        (model, thinkingLevel) =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: safeMime,
                    data: cleanedBase64,
                  },
                },
                {
                  text: `Transcribe ALL visible printed and/or handwritten text from this image accurately.
${hintLine}
Rules:
1. Preserve exact Tamil Unicode characters (including pulli dots ் and vowel signs) and exact English words.
2. Do NOT translate Tamil into English or English into Tamil. Do NOT summarize or rewrite.
3. Preserve paragraphs and natural line breaks where reasonably clear.
4. If no readable text is visible in the image, return an empty string for text and set uncertain to true with an explanation.
5. If handwriting, shadows, cropping, or blur make parts uncertain, do your best without inventing unrelated words, set uncertain=true, and describe what was hard to read in uncertaintyNote.`,
                },
              ],
            },
            config: {
              thinkingConfig: { thinkingLevel },
              systemInstruction:
                'You are an exact optical character and handwriting transcription engine for English, Tamil, and mixed Tamil+English pages. Transcribe faithfully without translating or embellishing.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  detectedLanguage: { type: Type.STRING },
                  writingStyle: { type: Type.STRING },
                  uncertain: { type: Type.BOOLEAN },
                  uncertaintyNote: { type: Type.STRING },
                },
                required: [
                  'text',
                  'detectedLanguage',
                  'writingStyle',
                  'uncertain',
                  'uncertaintyNote',
                ],
              },
            },
          }),
        20000,
      );

      const parsed = parseGeminiJson<{
        text: string;
        detectedLanguage: string;
        writingStyle: string;
        uncertain: boolean;
        uncertaintyNote: string;
      }>(response.text, {
        text: '',
        detectedLanguage: 'Unknown',
        writingStyle: 'Unclear',
        uncertain: true,
        uncertaintyNote: 'Could not parse OCR output.',
      });

      res.json({
        provider: 'gemini-vision',
        model: modelUsed,
        text: (parsed.text ?? '').trim(),
        detectedLanguage: parsed.detectedLanguage || 'Auto-detected',
        writingStyle: parsed.writingStyle || 'Printed / Handwritten',
        uncertain: Boolean(parsed.uncertain),
        uncertaintyNote: parsed.uncertaintyNote || '',
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({
        error: classified.code,
        message: classified.message,
      });
    }
  });

  // English Prefix / Root / Suffix Explorer
  app.post('/api/reading-tools/english-morphology', async (req: Request, res: Response) => {
    const { word, context } = (req.body ?? {}) as { word?: string; context?: string };
    const cleanWord = (word ?? '').trim().replace(/[^A-Za-z'-]/g, '');
    if (!cleanWord) {
      res.status(400).json({ error: 'A valid English word is required.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        message: 'Gemini AI is not configured on the server.',
      });
      return;
    }

    try {
      const prompt = `Break down the English word "${cleanWord}" into its prefix, root/base, and suffix for a learner.${context ? `\nSentence context: "${context.slice(0, 300)}"` : ''}
Rules:
- If there is no prefix, set prefix and prefixMeaning to "".
- If there is no suffix, set suffix and suffixMeaning to "".
- Never fabricate fake parts. If the word is an indivisible base word or etymology is irregular/uncertain, keep prefix="" and suffix="", explain honestly in howMeaningChanges, and set uncertain=true with a short note.`;

      const { result: response, modelUsed } = await callGeminiWithFallback(
        (model, thinkingLevel) =>
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel },
              systemInstruction:
                'You are an accurate English morphology tutor for learners with dyslexia. Keep explanations simple, honest, and concise.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  prefix: { type: Type.STRING },
                  prefixMeaning: { type: Type.STRING },
                  root: { type: Type.STRING },
                  rootMeaning: { type: Type.STRING },
                  suffix: { type: Type.STRING },
                  suffixMeaning: { type: Type.STRING },
                  howMeaningChanges: { type: Type.STRING },
                  uncertain: { type: Type.BOOLEAN },
                  note: { type: Type.STRING },
                },
                required: [
                  'word',
                  'prefix',
                  'prefixMeaning',
                  'root',
                  'rootMeaning',
                  'suffix',
                  'suffixMeaning',
                  'howMeaningChanges',
                  'uncertain',
                  'note',
                ],
              },
            },
          }),
      );

      const parsed = parseGeminiJson<{
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
      } | null>(response.text, null);

      if (!parsed) {
        res.status(502).json({ error: 'GEMINI_EMPTY', message: 'Empty morphology response.' });
        return;
      }

      res.json({ provider: 'gemini', model: modelUsed, ...parsed });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.code, message: classified.message });
    }
  });

  // Tamil Compound Word Splitter (சந்தி பிரித்தல்)
  app.post('/api/reading-tools/tamil-sandhi', async (req: Request, res: Response) => {
    const { word, context } = (req.body ?? {}) as { word?: string; context?: string };
    const cleanWord = (word ?? '').trim();
    if (!cleanWord || !containsTamil(cleanWord)) {
      res.status(400).json({ error: 'A valid Tamil word is required.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        message: 'Gemini AI is not configured on the server.',
      });
      return;
    }

    try {
      const prompt = `"${cleanWord}" என்ற தமிழ் சொல்லை இலக்கணப்படி (சந்தி பிரித்தல் / பகுபத உறுப்பு / வேர்ச்சொல் & விகுதி) பகுத்தாய்ந்து எளிய தமிழில் விளக்கவும்.${context ? `\nசூழல் வாக்கியம்: "${context.slice(0, 300)}"` : ''}
விதிகள்:
1. அசல் தமிழ் எழுத்துக்களைச் சிதைக்காமல் சரியான தமிழ் Unicode-ல் எழுதவும்.
2. உறுதியான பிரிப்பு இருந்தால் மட்டுமே component words, வேர்ச்சொல் (root), மற்றும் விகுதிகள்/இடைநிலைகள் (suffixes) பிரித்துக் காட்டவும்.
3. தவறான அல்லது கற்பனையான பிரிப்புகளை உருவாக்க வேண்டாம். சொல் தனிச்சொல்லாக இருந்தாலோ அல்லது பிரிப்பு சந்தேகத்திற்குரியதாக இருந்தாலோ uncertain=true எனக் குறித்து note புலத்தில் எளிய தமிழில் விளக்கவும்.`;

      const { result: response, modelUsed } = await callGeminiWithFallback(
        (model, thinkingLevel) =>
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel },
              systemInstruction:
                'நீங்கள் தமிழ் இலக்கண மற்றும் வாசிப்பு அணுகல்தன்மை நிபுணர். சந்தி பிரித்தல் (உம்: தமிழ் + அகம் -> தமிழகம்) மற்றும் விகுதி பிரிப்பதை எளிய தமிழில் துல்லியமாக விளக்குங்கள். உறுதியில்லாதபோது நேர்மையாக uncertain=true எனக் குறிப்பிடவும்.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  components: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        part: { type: Type.STRING },
                        role: { type: Type.STRING },
                        meaningTa: { type: Type.STRING },
                      },
                      required: ['part', 'role', 'meaningTa'],
                    },
                  },
                  root: { type: Type.STRING },
                  suffixes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  overallMeaningTa: { type: Type.STRING },
                  uncertain: { type: Type.BOOLEAN },
                  note: { type: Type.STRING },
                },
                required: [
                  'word',
                  'components',
                  'root',
                  'suffixes',
                  'overallMeaningTa',
                  'uncertain',
                  'note',
                ],
              },
            },
          }),
      );

      const parsed = parseGeminiJson<{
        word: string;
        components: Array<{ part: string; role: string; meaningTa: string }>;
        root: string;
        suffixes: string[];
        overallMeaningTa: string;
        uncertain: boolean;
        note: string;
      } | null>(response.text, null);

      if (!parsed) {
        res.status(502).json({ error: 'GEMINI_EMPTY', message: 'Empty Tamil sandhi response.' });
        return;
      }

      res.json({ provider: 'gemini', model: modelUsed, ...parsed });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.code, message: classified.message });
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
        const { result: response, modelUsed } = await callGeminiWithFallback(
          (model, thinkingLevel) =>
            ai.models.generateContent({
              model,
              contents: `Translate the following ${sourceName} text accurately into natural, clear ${targetName}. Preserve paragraph breaks and return only the translated text:\n\n${safeText}`,
              config: {
                thinkingConfig: { thinkingLevel },
              },
            }),
          9000,
        );
        const translatedText = (response.text ?? '').trim();
        if (translatedText) {
          res.json({
            translatedText,
            provider: 'gemini',
            model: modelUsed,
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
        message: `Translation failed (${message}). Check internet connectivity or set GEMINI_API_KEY on the server (Settings > Secrets or Vercel Environment Variables) to enable AI translation.`,
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

  return app;
}
