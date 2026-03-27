# DB Layer

Database integration for server-side persistence (Drizzle + PostgreSQL).

Rules:
- Keep table schema definitions in `schema.ts`.
- Keep direct SQL/ORM operations in `queries/*`.
- Expose connection bootstrap as a singleton (`client.ts`) to avoid per-request pool creation.
- Do not call DB operations from movement hot loops.
