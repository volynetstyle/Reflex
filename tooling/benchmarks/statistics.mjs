export function median(numbers) {
  if (!numbers.length || numbers.some(n => !Number.isFinite(n))) throw new Error("Median requires finite samples");
  const sorted = [...numbers].sort((a, b) => a - b), m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
// Exact order statistics bound the population median. The sampling units are
// independent process pairs; inside-process iterations never increase n.
// Bonferroni tails provide simultaneous coverage for the fixed scenario family.
export function medianInterval(samples, { confidence = 0.95, familySize = 1 } = {}) {
  if (!(confidence > 0 && confidence < 1) || !Number.isInteger(familySize) || familySize < 1) throw new Error("Invalid confidence/family size");
  const sorted = [...samples].sort((a, b) => a - b), n = sorted.length;
  if (!n || sorted.some(v => !Number.isFinite(v))) throw new Error("Invalid interval samples");
  const tail = (1 - confidence) / (2 * familySize);
  let logProbability = -n * Math.log(2), cumulative = Math.exp(logProbability), lowerIndex = -1;
  for (let k = 1; k <= Math.floor(n / 2); k++) {
    if (cumulative <= tail) lowerIndex = k - 1;
    logProbability += Math.log(n - k + 1) - Math.log(k); cumulative += Math.exp(logProbability);
  }
  return { lower: lowerIndex < 0 ? null : sorted[lowerIndex], upper: lowerIndex < 0 ? null : sorted[n - lowerIndex - 1], confidence, familySize, independentUnits: n, method: "exact-binomial-median-order-statistics-bonferroni", assumptions: ["independent process pairs", "fixed sample budget", "fixed scenario family", "exchangeable log-ratio distribution"] };
}
