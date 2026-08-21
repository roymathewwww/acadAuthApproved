// Every student's real email is firstname.lastname@<dept>.christuniversity.in
// (e.g. "roy.mathew@mca.christuniversity.in" -> MCA, an MSCAIML student's
// would be "...@mscaiml.christuniversity.in" -> MSCAIML). The department
// was previously hardcoded to "MSc Big Data Analytics" for every account
// regardless of program — this derives the real one from the login email
// instead, with a generic fallback for accounts that don't match the
// pattern (Google-login teacher/demo accounts, etc.).
export function deriveDepartment(email: string | null | undefined): string {
  if (!email) return "Student";
  const match = email.match(/@([a-z0-9]+)\.christuniversity\.in$/i);
  return match ? match[1].toUpperCase() : "Student";
}
