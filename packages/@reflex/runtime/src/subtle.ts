import { getCurrentComputedInternal } from "./internal";

export const subtle = {
  currentComputed() {
    return getCurrentComputedInternal();
  },
};
