import { resolveEmbeddingConfig, getEmbeddingRuntimeConfig } from '../llm/config';
import { embedTexts } from '../llm/provider';

function vectorLiteral(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => Number(item)).join(',')}]`;
  return String(value || '[]');
}

export { embedTexts, vectorLiteral, resolveEmbeddingConfig, getEmbeddingRuntimeConfig };
