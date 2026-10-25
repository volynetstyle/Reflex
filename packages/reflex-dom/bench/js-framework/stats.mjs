// Statistics as computed by js-framework-benchmark's results viewer:
// mean/median/sample standard deviation, a 95% confidence half-width
// (1.959964 * sd / sqrt(n)), Student's two-sample t-test with pooled
// variance (dof = n1 + n2 - 2, undecided above p = 0.05), factors relative to
// the fastest entry, and the weighted geometric mean of CPU factors.

/** CPU benchmark weights of the official overall score, in benchmark order. */
export const CPU_BENCHMARK_WEIGHTS = {
  "01_run1k": 0.64280248137063,
  "02_replace1k": 0.5607178150466176,
  "03_update10th1k_x16": 0.5643800750716564,
  "04_select1k": 0.1925635870170522,
  "05_swap1k": 0.13200612879341714,
  "06_remove-one-1k": 0.5277091212292658,
  "07_create10k": 0.5644449600965534,
  "08_create1k-after1k_x2": 0.5508359820582848,
  "09_clear1k_x8": 0.4225836631419211,
};

export function summarize(values) {
  const n = values.length;
  if (n === 0) {
    return { n, mean: NaN, median: NaN, sd: NaN, ci: NaN, min: NaN, max: NaN, values };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const sd =
    n > 1 ? Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)) : 0;

  return {
    n,
    mean,
    median,
    sd,
    ci: (1.959964 * sd) / Math.sqrt(n),
    min: sorted[0],
    max: sorted[n - 1],
    values,
  };
}

function logGamma(x) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const coefficient of c) series += coefficient / ++y;
  return -tmp + Math.log((2.5066282746310005 * series) / x);
}

function betaContinuedFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }

  return h;
}

function regularizedIncompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t-test with pooled variance. */
export function studentTTest(a, b) {
  const n1 = a.n;
  const n2 = b.n;
  const dof = n1 + n2 - 2;
  if (n1 < 2 || n2 < 2) return NaN;

  const pooled = ((n1 - 1) * a.sd ** 2 + (n2 - 1) * b.sd ** 2) / dof;
  const se = Math.sqrt(pooled * (1 / n1 + 1 / n2));
  if (se === 0) return a.mean === b.mean ? 1 : 0;

  const t = (a.mean - b.mean) / se;
  return regularizedIncompleteBeta(dof / 2, 0.5, dof / (dof + t * t));
}

/**
 * Weighted geometric mean of factors. Missing factors keep their weight in the
 * denominator, as in the original viewer.
 */
export function weightedGeometricMean(factors, weights) {
  let logSum = 0;
  let weightSum = 0;
  let hasValue = false;

  for (const [id, weight] of Object.entries(weights)) {
    weightSum += weight;
    const factor = factors[id];
    if (factor !== undefined && Number.isFinite(factor)) {
      logSum += weight * Math.log(factor);
      hasValue = true;
    }
  }

  return hasValue ? Math.exp(logSum / weightSum) : NaN;
}
