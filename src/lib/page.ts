/** Helpers for App Router pages. */

/** Type of `searchParams` as Next.js passes it to pages. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** First value of a search param, or undefined when empty. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() !== "" ? v : undefined;
}
