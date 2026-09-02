// Shared slot template — used by both the Class Leader's timetable editor
// and the student Attendance page's gain/lose calculator, so the two never
// drift apart on what a "period" means.
//
// Matches the real class timetable format: 5 real class slots/day (a 6th
// gap, 9:00-9:45, is a fixed break — not a schedulable slot). The first
// slot is clock-wise only 1.5h but counts as 2 periods for attendance
// purposes on every day except Saturday, where it counts as just 1.

export interface TimeSlot {
  index: number;
  label: string; // display time range
}

export const TIME_SLOTS: TimeSlot[] = [
  { index: 0, label: "7:30 - 9:00" },
  { index: 1, label: "9:45 - 10:45" },
  { index: 2, label: "10:45 - 11:45" },
  { index: 3, label: "11:45 - 12:45" },
  { index: 4, label: "12:45 - 1:45" },
];

export const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** How many "periods" a given (day, slot) is worth for attendance math. */
export function slotWeight(dayOfWeek: string, slotIndex: number): number {
  if (slotIndex !== 0) return 1;
  return dayOfWeek === "Saturday" ? 1 : 2;
}

// Cell text that never represents an attendance-bearing subject.
const NON_SUBJECT_CELLS = new Set(["break", "library", "clst", ""]);

/** Leading short code before any "(" / "/" — e.g. "ML LAB(HKJ,DVJ)" → "ML LAB", "CC(NS)" → "CC". */
export function leadingCode(cellText: string): string {
  return cellText.split(/[(/]/)[0].trim();
}

export function isSubjectCell(cellText: string): boolean {
  const code = leadingCode(cellText).toLowerCase();
  return code.length > 0 && !NON_SUBJECT_CELLS.has(code);
}

/** Initials of a full subject name — "Cloud Computing" → "CC", "Theory Of Computation" → "ToC". */
export function subjectInitials(name: string): string {
  const skip = new Set(["of", "and", "the", "for", "a", "an"]);
  return name
    .split(/\s+/)
    .filter((w) => w && !skip.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Does this timetable cell's leading code plausibly refer to `subjectName`? */
export function cellMatchesSubject(cellText: string, subjectName: string, subjectCode?: string | null): boolean {
  const lead = leadingCode(cellText).toUpperCase().replace(/\s+/g, "");

  // The class-management timetable editor now stores the exact subject name
  // (picked from a dropdown), so a plain full-name match is the common case.
  if (lead === subjectName.toUpperCase().replace(/\s+/g, "")) return true;

  // Older cells may still use a short code / initials — e.g. "CC(NS)" —
  // kept for backward compatibility with timetables saved before the dropdown.
  if (subjectCode) {
    const normCode = subjectCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normCode && (lead === normCode || normCode.startsWith(lead) || lead.startsWith(normCode))) return true;
  }
  return lead === subjectInitials(subjectName).toUpperCase();
}
