-- CreateEnum
CREATE TYPE "ChangeKind" AS ENUM ('WINDOW', 'ACCESS');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationPrefs" JSONB;

-- CreateTable
CREATE TABLE "OutletProfile" (
    "outletId" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "tradingOpenMin" INTEGER,
    "tradingCloseMin" INTEGER,
    "floorAreaM2" INTEGER,
    "departments" JSONB NOT NULL DEFAULT '[]',
    "leadership" JSONB NOT NULL DEFAULT '[]',
    "receivingContactName" TEXT,
    "receivingContactPhone" TEXT,
    "receivingStaff" INTEGER,
    "hasForklift" BOOLEAN NOT NULL DEFAULT false,
    "hasColdRoom" BOOLEAN NOT NULL DEFAULT false,
    "receivingNotes" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "OutletProfile_pkey" PRIMARY KEY ("outletId")
);

-- CreateTable
CREATE TABLE "OutletChangeRequest" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "kind" "ChangeKind" NOT NULL,
    "current" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ,
    "decisionNote" TEXT,

    CONSTRAINT "OutletChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutletChangeRequest_outletId_status_idx" ON "OutletChangeRequest"("outletId", "status");

-- AddForeignKey
ALTER TABLE "OutletProfile" ADD CONSTRAINT "OutletProfile_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletChangeRequest" ADD CONSTRAINT "OutletChangeRequest_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletChangeRequest" ADD CONSTRAINT "OutletChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletChangeRequest" ADD CONSTRAINT "OutletChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
