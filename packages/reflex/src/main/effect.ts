import { signal } from "./signal";

const effect = (scheduledFn: () => void) => {};

const effectOnce = (scheduledFn: () => void) => {};

const boolean = signal(false);

const coords = signal({ x: 0, y: 0 });

effect(() => {
  // but that not cause of values are untracked
  if (boolean.payload) {
    // thats calls effect runs cause in read we`re define track
    const readAndTrack = coords();
  }
  return () => {
    // cleanup something
  };
});
