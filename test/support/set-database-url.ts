import { inject } from 'vitest';

// Every spec boots the app on the Testcontainers database, never on an ambient URL.
process.env.DATABASE_URL = inject('databaseUrl');
