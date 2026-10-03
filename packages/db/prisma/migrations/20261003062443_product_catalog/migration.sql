-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "windowPref" TEXT;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "category" TEXT NOT NULL,
    "temp" "TempRequirement" NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "unitWeightKg" DOUBLE PRECISION NOT NULL,
    "unitVolumeM3" DOUBLE PRECISION NOT NULL,
    "maxQty" INTEGER NOT NULL DEFAULT 200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_brand_temp_isActive_idx" ON "Product"("brand", "temp", "isActive");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
