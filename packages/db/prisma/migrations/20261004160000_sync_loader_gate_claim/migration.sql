-- Trips a loader took in the loader app before that also counted as their depot-gate claim:
-- copy the claim across so the dispatcher's planning table and Start button see them.
UPDATE "Trip"
SET "loaderId" = "claimedById",
    "loaderClaimedAt" = COALESCE("claimedAt", "loadedAt", NOW())
WHERE "claimedById" IS NOT NULL
  AND "loaderClaimedAt" IS NULL
  AND "liveAt" IS NULL
  AND "status" IN ('LOADING', 'LOADED')
  AND ("loaderId" IS NULL OR "loaderId" = "claimedById");
