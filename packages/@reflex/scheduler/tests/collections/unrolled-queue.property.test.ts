import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { UnrolledQueue } from "../../src/collections/unrolled-queue";

describe("UnrolledQueue — property based tests", () => {
  it("preserves FIFO under random operations", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -10_000, max: 10_000 }), {
          minLength: 1,
          maxLength: 5000
        }),
        (values) => {
          const q = new UnrolledQueue<number>({ nodeSize: 16 })
          const reference: number[] = []

          for (const value of values) {
            if (Math.random() > 0.35) {
              q.enqueue(value)
              reference.push(value)
            } else {
              const a = q.dequeue()
              const b = reference.shift()

              expect(a).toBe(b)
            }

            expect(q.length).toBe(reference.length)
          }

          while (reference.length > 0) {
            expect(q.dequeue()).toBe(reference.shift())
          }

          expect(q.dequeue()).toBe(undefined)
          expect(q.peek()).toBe(undefined)
          expect(q.length).toBe(0)
        }
      ),
      { numRuns: 300 }
    )
  })

  it("correctly clears and reuses after arbitrary state", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 2000 }),
        (values) => {
          const q = new UnrolledQueue<number>({ nodeSize: 8 })

          for (const v of values) q.enqueue(v)
          q.clear()

          expect(q.length).toBe(0)
          expect(q.peek()).toBe(undefined)
          expect(q.dequeue()).toBe(undefined)

          for (let i = 0; i < 100; i++) q.enqueue(i * 2)

          for (let i = 0; i < 100; i++) {
            expect(q.dequeue()).toBe(i * 2)
          }

          expect(q.length).toBe(0)
        }
      )
    )
  })

  it("estimateNodes always over/near estimates", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }),
        (count) => {
          const q = new UnrolledQueue<number>({ nodeSize: 8 })
          const maxPerNode = 7

          for (let i = 0; i < count; i++) q.enqueue(i)

          const est = q.estimateNodes()
          const realMin = Math.ceil(count / maxPerNode)

          expect(est).toBeGreaterThanOrEqual(realMin)
          expect(est).toBeLessThanOrEqual(realMin + 2)
        }
      ),
      { numRuns: 250 }
    )
  })
})
