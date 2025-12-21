export type CapabilityIdentifier = symbol;
export type CapabilityWitness = object;

export type Environment = Record<string, CapabilityWitness>;

export type ExtensionAxiom<Γ extends Environment> = (env: Γ) => boolean;
