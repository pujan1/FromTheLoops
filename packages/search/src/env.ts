// Typesense connection config, read from the same env vars the rest of the
// stack uses (.env.example / compose). Centralised here so the client wrapper
// and the provisioning script can't drift on host/port/protocol/key.
//
// Defaults match docker-compose's local Typesense so dev "just works" with no
// .env at all; production (Vercel web read path + the Hetzner worker) sets all
// four explicitly.

export interface TypesenseConfig {
  host: string;
  port: number;
  protocol: string;
  apiKey: string;
}

export function readTypesenseConfig(
  env: NodeJS.ProcessEnv = process.env,
): TypesenseConfig {
  return {
    host: env.TYPESENSE_HOST ?? "localhost",
    port: Number(env.TYPESENSE_PORT ?? 8108),
    protocol: env.TYPESENSE_PROTOCOL ?? "http",
    apiKey: env.TYPESENSE_API_KEY ?? "local-dev-key",
  };
}
