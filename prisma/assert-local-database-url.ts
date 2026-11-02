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

// `prisma db push --url x` replaces the configured URL after the config loads.
function urlFlags(argv: string[]): string[] {
  return argv.flatMap((arg, index) => {
    if (arg === '--url') return argv[index + 1] ?? '';
    return arg.startsWith('--url=') ? arg.slice('--url='.length) : [];
  });
}

// Stops the Prisma CLI (migrate, db push...) from running against a remote database
// by accident. An empty URL passes, so `prisma generate` works without a database.
// It is a guard against accidents, not a security boundary.
export function assertLocalDatabaseUrl(
  url: string | undefined,
  allowRemote: string | undefined,
  argv: string[] = [],
): void {
  // `prisma generate` never opens a connection (postinstall), unless it runs TypedSQL.
  const isPlainGenerate = argv[2] === 'generate' && !argv.includes('--sql');
  const urls = [url, ...urlFlags(argv)];
  if (
    isPlainGenerate ||
    allowRemote === 'yes' ||
    urls.every((value) => !value || isLocal(value))
  ) {
    return;
  }
  throw new Error(
    'DATABASE_URL does not point to localhost, 127.0.0.1 or ::1. ' +
      'Prisma refuses to run against it. Set ALLOW_REMOTE_DB=yes if this is intended.',
  );
}
