# DB Layer

Database integration for server-side persistence (Drizzle + PostgreSQL).

Rules:
- Keep table schema definitions in `schema.ts`.
- Keep direct SQL/ORM operations in `queries/*`.
- Expose connection bootstrap as a singleton (`client.ts`) to avoid per-request pool creation.
- Do not call DB operations from movement hot loops.
- User identity mapping for auth should use `users.auth_user_id` (Supabase Auth user id) and `users.email`.
- Never add password storage to app-managed DB tables when Supabase Auth is in use.
