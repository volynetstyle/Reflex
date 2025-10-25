export function createReactiveRuntime<T = undefined>() {
  let CurrentReaction: T | undefined;
  let CurrentGets: T[] | null;
  let CurrentGetsIndex = 0;
  let GlobalQueue = [];
  let Epoch = 0;

  function beginComputation(r: T) {
    CurrentReaction = r;
    CurrentGets = [];
    CurrentGetsIndex = 0;
  }

  function endComputation() {
    CurrentReaction = undefined;
    CurrentGets = null;
    CurrentGetsIndex = 0;
  }

  function track<T>(signal: T) {
    throw new Error();
  }

  return {
    beginComputation,
    endComputation,
    track,
    get context() {
      return { CurrentReaction, CurrentGets, CurrentGetsIndex };
    },
  };
}

// const AppRuntime = createReactiveRuntime();
// const WorkerRuntime = createReactiveRuntime();

// AppRuntime.beginComputation(myReaction);
// AppRuntime.track(signalA);
// AppRuntime.endComputation();

// // worker работает независимо
// WorkerRuntime.beginComputation(otherReaction);
// WorkerRuntime.track(signalB);
// WorkerRuntime.endComputation();
