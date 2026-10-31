/** Additional LOCAL development quota guard. Not public-service authentication. */
export function createLocalUploadLimiter(limit = 6, windowMs = 3600000) {
  let start: number | null = null, used = 0;
  return (now = Date.now()) => {
    if (start === null || now - start >= windowMs) { start = now; used = 0; }
    if (used >= limit) return false;
    used++; return true;
  };
}
