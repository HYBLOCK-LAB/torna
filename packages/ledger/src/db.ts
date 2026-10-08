import postgres from 'postgres';

export type Sql = postgres.Sql;

/**
 * Connect with DATABASE_URL (Supabase Session pooler URI, see .env.example).
 * The service connection bypasses RLS; never expose it to the browser.
 */
export function connect(url: string | undefined = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error('DATABASE_URL is not set. Run: set -a; source .env; set +a');
  return postgres(url, {
    prepare: false,          // safe with Supabase poolers
    max: 4,
    onnotice: () => {},      // schema.sql emits "does not exist, skipping" notices
    types: {},
  });
}
