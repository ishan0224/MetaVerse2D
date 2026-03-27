# Services

Application services that coordinate domain + infrastructure work.

Rules:
- Keep business orchestration here (for example persistence policies).
- Services may call domain managers and db query modules.
- Keep socket handlers thin by delegating non-transport concerns to services.
- Persistence writes should be outside movement hot loops and should fail gracefully.
