import { activeConsumer, setActiveConsumer } from "../../reactivity";

/**
 * Execute a callback function without registering reactive dependencies.
 * 
 * Temporarily clears the active computation context, allowing reads within
 * the callback to NOT create dependency edges. Useful for:
 * 
 * - Debugging or logging values without affecting reactivity
 * - Accessing side-effect values that shouldn't trigger re-execution
 * - Breaking dependency chains when you need a one-time read
 * 
 * The context is always restored after the callback returns, even if an
 * exception is thrown.
 * @template T - The return type of the callback
 * @param {() => T} fn - Function to execute without dependency tracking
 * @returns {T} The return value of the callback
 * @throws Propagates any exception thrown by the callback
 * @example const signal = createProducer(42)

const computed = createConsumer(() => {
  const value = readProducer(signal)  // Creates dependency

  // Read the value without creating dependency
  const debugValue = untracked(() => readProducer(signal))

  return value * 2
})

// If signal changes, computed re-executes (has dependency)
// But untracked read inside doesn't affect this
 * @invariant context.activeConsumer is null during fn() execution
 * @invariant context.activeConsumer is restored after fn() returns/throws
 * @cost O(1) for context manipulation
 */
export function untracked<T>(fn: () => T): T {
  // Save the current active computation context
  const prev = activeConsumer;
  // Clear the active context so reads don't create dependencies
  setActiveConsumer(null);

  try {
    // Execute the callback in untracked context
    return fn();
  } finally {
    // Always restore the previous context
    setActiveConsumer(prev);
  }
}
