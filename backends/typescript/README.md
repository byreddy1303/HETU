# Legacy TypeScript backend

The original Supabase Edge Functions, SQL migrations, and config are retained
under `supabase/`. This is still the live frontend's data source until a verified
Python cutover. Moving files does not migrate or delete any remote data.

From the repository root use `npm run supabase:start`,
`npm run supabase:migrate`, or `npm run supabase:functions:deploy`.
For direct CLI calls: `supabase --workdir backends/typescript ...`.
