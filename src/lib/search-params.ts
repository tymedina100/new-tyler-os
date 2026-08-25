/** A search param can legally arrive as a repeated key; take the first value. */
export function readParam(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first.length === 0 ? undefined : first;
}
