-- Depot gate: crew claims, dispatcher start / hold, and when a trip went live.
ALTER TABLE "Trip" ADD COLUMN "driverClaimedAt" TIMESTAMPTZ,
ADD COLUMN "loaderId" TEXT,
ADD COLUMN "loaderClaimedAt" TIMESTAMPTZ,
ADD COLUMN "heldAt" TIMESTAMPTZ,
ADD COLUMN "liveAt" TIMESTAMPTZ;

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_loaderId_fkey" FOREIGN KEY ("loaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Plans already published before the gate existed keep running: their trips count as released.
UPDATE "Trip" SET "liveAt" = COALESCE("departedAt", NOW())
WHERE "planId" IN (SELECT "id" FROM "Plan" WHERE "status" = 'PUBLISHED');
