import { z } from "zod";
import { ValidationError } from "@/lib/errors";

export const idSchema = z.string().min(1).max(64);
/** Non-negative integer cents, up to 10 million */
export const centsSchema = z.number().int().min(0).max(1_000_000_000);
export const quantitySchema = z.number().int().min(1).max(100_000);

export const requiredText = (max = 200) => z.string().trim().min(1, "Required").max(max);
export const optionalText = (max = 500) => z.string().trim().max(max).optional().nullable();

/** "" / whitespace / undefined -> null */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Validates input against a zod schema, throwing a ValidationError with a readable message. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    const first = issues[0];
    const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : "Invalid input";
    throw new ValidationError(message, issues);
  }
  return result.data;
}
