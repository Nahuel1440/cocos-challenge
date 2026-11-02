const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const HOST_PARAMS = ['host', 'hostaddr'];

function isLocal(url: string): boolean {
  try {
    const parsed = new URL(url);
    // pg lets ?host= override the host in the URL, so a local host there proves nothing.
    if (HOST_PARAMS.some((param) => parsed.searchParams.has(param))) {
      return false;
    }
    return LOCAL_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// Stops the Prisma CLI (migrate, db push...) from running against a remote database
// by accident. An empty URL passes, so `prisma generate` works without a database.
export function assertLocalDatabaseUrl(
  url: string | undefined,
  allowRemote: string | undefined,
): void {
  if (!url || allowRemote === 'yes' || isLocal(url)) return;
  throw new Error(
    'DATABASE_URL does not point to localhost, 127.0.0.1 or ::1. ' +
      'Prisma refuses to run against it. Set ALLOW_REMOTE_DB=yes if this is intended.',
  );
}
