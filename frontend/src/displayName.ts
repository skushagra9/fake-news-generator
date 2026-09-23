// Builds a person's display name from their first and last name.
// Tolerant of partial data: each field is trimmed, blanks are dropped, and
// the join collapses so we never render a stray leading/trailing space (or
// the literal "null") for a user who only has one name on file.
export function getDisplayName(
  firstName?: string | null,
  lastName?: string | null
): string {
  return [firstName, lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ");
}
