# Bounded-lookahead block rotation: pre-implementation contract

Scope: replace only `moveTrackedIncomingEdgeAfterCursorUnchecked`, called after one-/two-hop matches. The rest of the preserve candidate is unchanged. No runtime selector, adaptive detach, new node field or callback is introduced. Rotation lives in an experiment overlay, not production src.

Seven obligations:

1. `[firstIn ... tailIn]` remains a contiguous current prefix.
2. Everything right of tailIn is unvisited in this pass; skipped does not mean stale.
3. Each attached edge occurs exactly once in its consumer incoming list.
4. Rotation does not change producer outgoing lists or edge identities.
5. firstIn/lastIn and prevIn/nextIn remain mutually consistent.
6. Throw retains a valid partial trace and a valid unvisited suffix from which retry can reconcile. No rollback is required if this is established.
7. Nested execution/reentrancy cannot observe an intermediate splice: no callback, allocation or await inside the synchronous pointer-write sequence on ordinary runtime objects.

Entry inherited from the existing helper: cursor non-null and in consumer list; candidate strictly after expected=cursor.nextIn; candidate.prevIn non-null; all edges attached in the same list. Known endpoints `H=expected`, `T=candidate.prevIn`, `L=consumer.lastIn`. Physical order is `prefix P | H..T C..L`.

Writes: P.nextIn=C; C.prevIn=P; L.nextIn=H; H.prevIn=L; T.nextIn=null; consumer.lastIn=T. Then candidate.version=passVersion; consumer.tailIn=C. Result `prefix P C | ... L H..T`. All endpoints are captured first, including C==L alias. Intermediate structure is not exposed. No outgoing/version changes on other edges. This gives six incoming-list writes plus one cursor write (seven counted incoming pointer writes), independent of gap/run length.

After throw, advance clears Computing and forces Changed, retains the partial list, and restores previous consumer. The local structure proof is insufficient for semantic equivalence by itself: runtime probes must cover throw after each read, retry with same/different traces, nested reads, untracked work, writes to prefix/suffix and self-disposal. A full permutation/throw matrix is additionally checked on the actual compiled bundles.

The kernel cannot know whether the skipped head is the next read or never read again. This experiment uses unconditional rotation only at the existing bounded match site, without a gap heuristic. Cyclic shift distances outside this site are controls, not evidence for a generalized rotation algorithm.
