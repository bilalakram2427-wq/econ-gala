-- Let the guest importer (and any other server-side script) use the tables.
--
-- Found on the first real import: "permission denied for table guests".
--
-- When a Supabase project is created with "Automatically expose new tables"
-- unticked, Supabase stops granting access on new tables to ALL of its API
-- roles, including service_role, which is the one the secret key maps to.
-- 002_rls.sql then revoked from anon and authenticated, as intended, but
-- nothing ever granted service_role anything, so the import could not read or
-- write a single table.
--
-- service_role is for scripts running on Bilal's laptop only. The secret key
-- never goes in the repo, in Vercel, or in a browser. It also bypasses RLS by
-- design, which is why it is the one role it is safe to give everything to.
--
-- Nothing here touches what anon or authenticated can do.

begin;

grant usage on schema public to service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Anything added later is covered too, so a future migration cannot
-- reintroduce this.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

commit;
