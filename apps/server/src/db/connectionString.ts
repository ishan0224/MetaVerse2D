export interface ResolvedDatabaseUrl {
  value: string | null;
  wasAdjustedForLibpqCompatibility: boolean;
}

function normalizeSupabasePoolerSslMode(databaseUrl: string): ResolvedDatabaseUrl {
  try {
    const parsedUrl = new URL(databaseUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const sslMode = parsedUrl.searchParams.get('sslmode')?.toLowerCase();
    const hasLibpqCompat = parsedUrl.searchParams.has('uselibpqcompat');
    const isSupabasePooler = hostname.endsWith('.pooler.supabase.com');

    if (isSupabasePooler && sslMode === 'require' && !hasLibpqCompat) {
      parsedUrl.searchParams.set('uselibpqcompat', 'true');
      return {
        value: parsedUrl.toString(),
        wasAdjustedForLibpqCompatibility: true,
      };
    }
  } catch {
    // Keep the original string when URL parsing fails.
  }

  return {
    value: databaseUrl,
    wasAdjustedForLibpqCompatibility: false,
  };
}

export function resolveDatabaseUrl(rawValue: string | undefined): ResolvedDatabaseUrl {
  const trimmedValue = rawValue?.trim();
  if (!trimmedValue) {
    return {
      value: null,
      wasAdjustedForLibpqCompatibility: false,
    };
  }

  return normalizeSupabasePoolerSslMode(trimmedValue);
}
