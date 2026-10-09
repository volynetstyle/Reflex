/** A host request is distinct from the semantic work it eventually resumes. */
export type HostToken = number;

export interface HostCarrier {
  postMicrotask(resume: (token: HostToken) => void): HostToken;
}

export function createPromiseMicrotaskCarrier(): HostCarrier {
  let nextToken = 0;

  return {
    postMicrotask(resume) {
      const token = ++nextToken;
      void Promise.resolve().then(() => resume(token));
      return token;
    },
  };
}
