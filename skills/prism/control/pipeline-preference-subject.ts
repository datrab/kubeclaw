/** The configured value is platform-owned, unlike a Nova project/stage request. */
export function authorizePipelinePreferenceSubject(requested: unknown, configured: unknown): string | null {
  if (configured !== undefined && (typeof configured !== 'string' || !/^user-[a-f0-9]{24}$/u.test(configured))) {
    throw new Error('invalid platform pipeline preference subject');
  }
  if (requested === undefined) return typeof configured === "string" ? configured : null;
  if (typeof requested !== 'string' || requested !== configured) {
    throw new Error('pipeline preference subject is not authorized by platform configuration');
  }
  return requested;
}
