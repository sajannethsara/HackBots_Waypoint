-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "carryOverOrderId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "carriedFromOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_carriedFromOrderId_fkey" FOREIGN KEY ("carriedFromOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_carryOverOrderId_fkey" FOREIGN KEY ("carryOverOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
