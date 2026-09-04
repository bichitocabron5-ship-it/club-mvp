const SUPABASE_POOLER_HOST_SUFFIX = ".pooler.supabase.com";

const REQUIRED_SUPABASE_POOLER_PARAMS = [
  ["sslmode", "require"],
  ["connect_timeout", "30"],
] as const;

function isSupabasePoolerHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === "pooler.supabase.com" ||
    normalizedHostname.endsWith(SUPABASE_POOLER_HOST_SUFFIX)
  );
}

export function withSupabasePoolerConnectionParams(connectionString: string) {
  const trimmedConnectionString = connectionString.trim();

  if (!trimmedConnectionString) {
    return trimmedConnectionString;
  }

  let url: URL;

  try {
    url = new URL(trimmedConnectionString);
  } catch {
    return connectionString;
  }

  if (!isSupabasePoolerHost(url.hostname)) {
    return connectionString;
  }

  let changed = false;

  for (const [name, value] of REQUIRED_SUPABASE_POOLER_PARAMS) {
    if (!url.searchParams.has(name)) {
      url.searchParams.set(name, value);
      changed = true;
    }
  }

  return changed ? url.toString() : connectionString;
}

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL no configurada. Define una URL PostgreSQL; para Supabase Session Pooler usa sslmode=require y connect_timeout=30."
    );
  }

  return withSupabasePoolerConnectionParams(databaseUrl);
}
