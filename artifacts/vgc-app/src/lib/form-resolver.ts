import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

export function zodFormResolver<TSchema extends z.ZodSchema>(
  schema: TSchema
): Resolver<z.infer<TSchema>> {
  return async (values, _context, _options) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data as z.infer<TSchema>, errors: {} };
    }
    const fieldErrors: FieldErrors<z.infer<TSchema>> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (path && !(path in fieldErrors)) {
        (fieldErrors as Record<string, unknown>)[path] = { type: issue.code, message: issue.message };
      }
    }
    return { values: {} as z.infer<TSchema>, errors: fieldErrors };
  };
}
