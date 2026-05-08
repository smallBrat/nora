// Provider registry. Resolves a provider id to its concrete strategy
// implementation, falling back to a LegacyProviderAdapter for any
// provider id that has not yet been migrated. Registered providers
// always win over the legacy adapter.

import type { Provider } from "../../types/provider";

export interface ProviderRegistry {
  register(provider: Provider): void;
  has(providerId: string): boolean;
  resolve(providerId: string): Provider;
  list(): Provider[];
}

export type LegacyFactory = (providerId: string) => Provider;

export function createProviderRegistry(legacyFactory: LegacyFactory): ProviderRegistry {
  const registered = new Map<string, Provider>();

  return {
    register(provider) {
      registered.set(provider.id, provider);
    },
    has(providerId) {
      return registered.has(providerId);
    },
    resolve(providerId) {
      return registered.get(providerId) ?? legacyFactory(providerId);
    },
    list() {
      return Array.from(registered.values());
    },
  };
}
