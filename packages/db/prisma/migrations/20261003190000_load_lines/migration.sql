-- CreateTable
CREATE TABLE "LoadLine" (
    "stopId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "loadedQty" INTEGER NOT NULL,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "countedById" TEXT NOT NULL,
    "countedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "LoadLine_pkey" PRIMARY KEY ("stopId","orderLineId")
);

-- AddForeignKey
ALTER TABLE "LoadLine" ADD CONSTRAINT "LoadLine_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadLine" ADD CONSTRAINT "LoadLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadLine" ADD CONSTRAINT "LoadLine_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

