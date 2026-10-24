---
"@volynets/reflex-runtime": patch
---

Repeated reads of a broad signal or computed inside a wide computation are much cheaper. In a pattern like `items.map((item) => format(item, theme()))`, every re-read of `theme` searched the dependency lists again; the runtime now remembers the edge its last search found in a slot each node already has, so a re-read costs one comparison (about 3× faster on a 64-item benchmark whose hub has 64 other subscribers). Behavior, dependency order and memory use are unchanged. Unmounting large subtrees costs about 2% more, the price of keeping that slot exact.
