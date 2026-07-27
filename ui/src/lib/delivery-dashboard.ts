export function getWorkloadLevel(activeCount: number, unavailable = false): number {
  if (unavailable) return 4;
  return Math.max(0, Math.min(4, activeCount));
}
