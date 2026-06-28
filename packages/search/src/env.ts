// Typesense connection config. Defaults match docker-compose's local Typesense;
// production sets all four explicitly.

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
