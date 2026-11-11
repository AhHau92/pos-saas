/** Browser-side helper for calling our JSON API. */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function apiRequest<T = unknown>(
  url: string,
  options: { method?: Method; body?: unknown; /** login forms: show the 401 message instead of redirecting */ noAuthRedirect?: boolean } = {},
): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    method: options.method ?? (hasBody ? "POST" : "GET"),
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const error = (data as { error?: { message?: string; code?: string } } | null)?.error;
    if (response.status === 401 && !options.noAuthRedirect && typeof window !== "undefined") {
      window.location.href = window.location.pathname.startsWith("/platform") ? "/platform/login" : "/login";
    }
    throw new ApiError(error?.message ?? `Request failed (${response.status})`, response.status, error?.code);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
