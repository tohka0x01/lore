interface SearchParamLike {
  get(name: string): string | null;
  toString(): string;
}

export type UrlStateValue = string | number | boolean | null | undefined;

function normalizeUrlStateValue(value: UrlStateValue): string {
  if (value == null) return '';
  return String(value).trim();
}

export function readStringParam(
  params: SearchParamLike | null | undefined,
  key: string,
  fallback = '',
): string {
  const value = normalizeUrlStateValue(params?.get(key));
  return value || fallback;
}

export function readNumberParam(
  params: SearchParamLike | null | undefined,
  key: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
): number {
  const raw = normalizeUrlStateValue(params?.get(key));
  if (!raw) return fallback;
  const numeric = Math.trunc(Number(raw));
  if (!Number.isFinite(numeric)) return fallback;
  if (options.min != null && numeric < options.min) return options.min;
  if (options.max != null && numeric > options.max) return options.max;
  return numeric;
}

export function readBooleanParam(
  params: SearchParamLike | null | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const raw = normalizeUrlStateValue(params?.get(key)).toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

export function buildUrlWithSearchParams(
  pathname: string,
  currentParams: SearchParamLike | null | undefined,
  patch: Record<string, UrlStateValue>,
  defaults: Record<string, UrlStateValue> = {},
): string {
  const next = new URLSearchParams(currentParams?.toString() || '');

  for (const [key, value] of Object.entries(patch)) {
    const normalized = normalizeUrlStateValue(value);
    const defaultValue = normalizeUrlStateValue(defaults[key]);
    if (!normalized || normalized === defaultValue) {
      next.delete(key);
      continue;
    }
    next.set(key, normalized);
  }

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
