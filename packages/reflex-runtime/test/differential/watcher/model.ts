export const enum Evidence {
  None = 0b00,
  Unknown = 0b01,
  Changed = 0b10,
  Both = Unknown | Changed,
}

export const evidenceValues = [
  Evidence.None,
  Evidence.Unknown,
  Evidence.Changed,
  Evidence.Both,
] as const;

export function joinEvidence(left: Evidence, right: Evidence): Evidence {
  return (left | right) as Evidence;
}

export function meetEvidence(left: Evidence, right: Evidence): Evidence {
  return (left & right) as Evidence;
}

export function complementEvidence(value: Evidence): Evidence {
  return (~value & Evidence.Both) as Evidence;
}

export function evidenceLeq(left: Evidence, right: Evidence): boolean {
  return (left & right) === left;
}
