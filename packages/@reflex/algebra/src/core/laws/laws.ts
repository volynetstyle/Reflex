export type Law = {
  name: string
  check: () => boolean
}

export type LawSet = readonly Law[]
