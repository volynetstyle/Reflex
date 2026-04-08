import { useEffect, useEffectOnce } from "./useEffect";

export function useComponentDidMount(callback: () => void): void {
  useEffectOnce(() => {
    callback();
  });
}

export function useComponentDidUnmount(callback: () => void): void {
  useEffect(() => callback);
}
