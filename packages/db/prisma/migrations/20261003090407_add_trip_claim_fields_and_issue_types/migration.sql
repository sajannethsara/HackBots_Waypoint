-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IssueType" ADD VALUE 'SEQUENCE_ISSUE';
ALTER TYPE "IssueType" ADD VALUE 'DEPARTURE_DELAY';

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "claimedAt" TIMESTAMPTZ,
ADD COLUMN     "claimedById" TEXT;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
