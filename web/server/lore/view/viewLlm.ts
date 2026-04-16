import { truncate } from '../core/utils';
import { normalizeList } from './viewBuilders';
import type { EmbeddingConfig } from '../core/types';
import { resolveViewLlmConfig, type ResolvedViewLlmConfig } from '../llm/config';
import { generateText, type ProviderMessage } from '../llm/provider';

// ---------------------------------------------------------------------------
// LLM config resolution
// ---------------------------------------------------------------------------

export { resolveViewLlmConfig };
export type ViewLlmConfig = ResolvedViewLlmConfig;

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

export function extractJsonObject(text: unknown): Record<string, unknown> | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// LLM chat completion
// ---------------------------------------------------------------------------

export async function chatCompletion(
  config: ViewLlmConfig,
  messages: ProviderMessage[],
): Promise<string> {
  const response = await generateText(config, messages);
  return response.content;
}

// ---------------------------------------------------------------------------
// View generation prompt builder
// ---------------------------------------------------------------------------

export function buildViewGenerationMessages(doc: Record<string, unknown>): Array<{ role: string; content: string }> {
  const payload = {
    uri: doc.uri,
    path: doc.path,
    priority: doc.priority,
    disclosure: truncate(doc.disclosure, 180),
    glossary_keywords: normalizeList(doc.glossary_keywords as unknown[] || [], 12),
    body_preview: truncate(doc.body_preview, 600),
  };

  return [
    {
      role: 'system',
      content: [
        'You generate retrieval views for a memory system.',
        'Return strict JSON only.',
        'Keys: gist(string), question(string[]).',
        'gist: 1-2 dense sentences that summarize what this memory is about and when it should be recalled.',
        'question: exactly 3 specific, diverse natural-language questions that someone may ask later and this memory should help answer.',
        'Each question must be concrete and distinct — avoid vague patterns like "关于X，我应该想起什么？" or "What should I remember about X?".',
        'Good questions target specific facts, decisions, or context within the memory (e.g. "部署Lore时用的哪个Portainer stack ID？" instead of "关于Lore部署，我应该想起什么？").',
        'Use the same dominant language as the source material.',
        'Do not output tags, keywords, cue lists, path fragments, or generic labels.',
        'Do not include markdown fences.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify(payload, null, 2),
    },
  ];
}

// ---------------------------------------------------------------------------
// LLM refinement pipeline
// ---------------------------------------------------------------------------

export async function refineDocumentWithLlm(
  doc: Record<string, unknown>,
  config: ViewLlmConfig,
): Promise<{ gist: string; question: string[]; model: string } | null> {
  try {
    const raw = await chatCompletion(config, buildViewGenerationMessages(doc));
    const parsed = extractJsonObject(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const gist = truncate(parsed.gist, 320);
    const question = normalizeList(parsed.question as unknown[] || [], 3).slice(0, 3);

    if (!gist || question.length < 3) return null;
    return { gist, question, model: config.model };
  } catch {
    return null;
  }
}

export async function refineDocumentsWithLlm(
  docs: Record<string, unknown>[],
  config: ViewLlmConfig | null,
): Promise<Record<string, unknown>[]> {
  if (!config || docs.length === 0) return docs;
  const refinedDocs: Record<string, unknown>[] = [];
  for (const doc of docs) {
    const refined = await refineDocumentWithLlm(doc, config);
    refinedDocs.push(refined ? { ...doc, llm_views: refined } : doc);
  }
  return refinedDocs;
}
