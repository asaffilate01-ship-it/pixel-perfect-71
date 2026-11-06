-- Server-only account administration needs to confirm the single MealDeck kitchen.
-- Customer and staff browser roles stay without direct table access.
GRANT SELECT ON public.tenants TO service_role;