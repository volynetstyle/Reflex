// save as add_benchmark.js

// 1. Warm up functions to eliminate compilation overhead variance
function testStandardAdd(a, b) {
  return a + b;
}

function testIntrinsicAdd(a, b) {
  return %Add(a, b);
}

// Prepare V8 optimization vectors
%PrepareFunctionForOptimization(testStandardAdd);
%PrepareFunctionForOptimization(testIntrinsicAdd);

testStandardAdd(1, 2);
testIntrinsicAdd(1, 2);

// Force optimization to ensure we are testing peak performance
%OptimizeFunctionOnNextCall(testStandardAdd);
testStandardAdd(1, 2);

%OptimizeFunctionOnNextCall(testIntrinsicAdd);
testIntrinsicAdd(1, 2);

const ITERATIONS = 100_000_000;

// --- BENCHMARK 1: Standard "+" Operator ---
const startStandard = process.hrtime.bigint();
let sumStandard = 0;
for (let i = 0; i < ITERATIONS; i++) {
  sumStandard = testStandardAdd(sumStandard, 1);
}
const endStandard = process.hrtime.bigint();
const timeStandard = Number(endStandard - startStandard) / 1_000_000; // ms

// --- BENCHMARK 2: Intrinsic "%Add" ---
const startIntrinsic = process.hrtime.bigint();
let sumIntrinsic = 0;
for (let i = 0; i < ITERATIONS; i++) {
  sumIntrinsic = testIntrinsicAdd(sumIntrinsic, 1);
}
const endIntrinsic = process.hrtime.bigint();
const timeIntrinsic = Number(endIntrinsic - startIntrinsic) / 1_000_000; // ms

// --- REPORT RESULTS ---
console.log(`=== Benchmark Results (${ITERATIONS.toLocaleString()} operations) ===`);
console.log(`Standard (+) Operator Time : ${timeStandard.toFixed(2)} ms`);
console.log(`Intrinsic (%Add) Time      : ${timeIntrinsic.toFixed(2)} ms`);

const difference = (timeIntrinsic / timeStandard).toFixed(1);
console.log(`\nResult: Standard (+) is roughly ${difference}x FASTER than %Add.`);

// Prevent dead-code elimination by using the results
if (sumStandard !== sumIntrinsic) {
  console.log("Error: Sums do not match!");
}
