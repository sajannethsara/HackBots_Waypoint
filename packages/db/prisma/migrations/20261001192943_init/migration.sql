-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DISPATCHER', 'LOADER', 'DRIVER', 'STORE_MANAGER');

-- CreateEnum
CREATE TYPE "Brand" AS ENUM ('FRESH', 'STYLE', 'TECH');

-- CreateEnum
CREATE TYPE "DockType" AS ENUM ('REAR_DOCK', 'STREET', 'MALL_BAY');

-- CreateEnum
CREATE TYPE "ParkingConstraint" AS ENUM ('NORMAL', 'VAN_ONLY', 'MALL_DOCK');

-- CreateEnum
CREATE TYPE "RoadClass" AS ENUM ('URBAN', 'SUBURBAN', 'HIGHWAY', 'HILL');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRUCK', 'VAN');

-- CreateEnum
CREATE TYPE "VehicleTemp" AS ENUM ('REEFER', 'AMBIENT');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'IN_WORKSHOP');

-- CreateEnum
CREATE TYPE "TempRequirement" AS ENUM ('CHILLED', 'AMBIENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'PLANNED', 'DEFERRED', 'LOADED', 'IN_TRANSIT', 'DELIVERED', 'PARTIAL', 'REFUSED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'LOADING', 'LOADED', 'DEPARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDING', 'ARRIVED', 'DELIVERED', 'PARTIAL', 'REFUSED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('PENDING', 'STOWED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "Decision" AS ENUM ('SERVED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "DecisionSource" AS ENUM ('ENGINE', 'DISPATCHER');

-- CreateEnum
CREATE TYPE "DeferralReason" AS ENUM ('REEFER_CAPACITY', 'VEHICLE_CAPACITY', 'FUEL_QUOTA', 'DELIVERY_WINDOW', 'ACCESS_RESTRICTION', 'VEHICLE_UNAVAILABLE', 'LOADING_SHORTFALL', 'TIME_BUDGET', 'LOWER_PRIORITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryEventType" AS ENUM ('TRIP_DEPARTED', 'ARRIVED', 'DELIVERED', 'PARTIAL', 'REFUSED', 'STOP_DEPARTED', 'TRIP_COMPLETED');

-- CreateEnum
CREATE TYPE "IssueStage" AS ENUM ('PLANNING', 'LOADING', 'DELIVERY', 'RECEIPT');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('LOAD_MISSING', 'LOAD_DAMAGED', 'CAPACITY_BREACH', 'LATE_ARRIVAL', 'DELIVERY_REFUSED', 'OUTLET_CLOSED', 'ACCESS_BLOCKED', 'VEHICLE_BREAKDOWN', 'TEMPERATURE', 'RECEIPT_MISSING', 'RECEIPT_DAMAGED', 'RECEIPT_WRONG_ITEMS', 'OTHER');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('CONFIRMED', 'CONFIRMED_WITH_ISSUES', 'DISPUTED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('SIGNATURE', 'PHOTO');

-- CreateEnum
CREATE TYPE "FuelEntryKind" AS ENUM ('PLANNED', 'ACTUAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ForecastSource" AS ENUM ('BASELINE', 'MODEL');

-- CreateTable
CREATE TABLE "Depot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "roadClass" "RoadClass" NOT NULL,
    "freeFlowKmh" DOUBLE PRECISION NOT NULL,
    "depotToDistrictKm" DOUBLE PRECISION NOT NULL,
    "depotToDistrictMin" DOUBLE PRECISION NOT NULL,
    "interStopKm" DOUBLE PRECISION NOT NULL,
    "interStopMin" DOUBLE PRECISION NOT NULL,
    "centroidLat" DOUBLE PRECISION,
    "centroidLng" DOUBLE PRECISION,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outlet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "districtId" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "dockType" "DockType" NOT NULL,
    "parkingConstraint" "ParkingConstraint" NOT NULL,
    "mallWindowOpenMin" INTEGER,
    "mallWindowCloseMin" INTEGER,
    "windowOpenMin" INTEGER NOT NULL,
    "windowCloseMin" INTEGER NOT NULL,
    "lastDeliveredOn" DATE,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "temp" "VehicleTemp" NOT NULL,
    "weightCapKg" DOUBLE PRECISION NOT NULL,
    "volumeCapM3" DOUBLE PRECISION NOT NULL,
    "fuelType" TEXT NOT NULL,
    "kmPerL" DOUBLE PRECISION NOT NULL,
    "weeklyFuelQuotaL" DOUBLE PRECISION NOT NULL,
    "depotId" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAllowance" (
    "brand" "Brand" NOT NULL,
    "dockType" "DockType" NOT NULL,
    "minutes" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ServiceAllowance_pkey" PRIMARY KEY ("brand","dockType")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "date" DATE NOT NULL,
    "dow" INTEGER NOT NULL,
    "dowName" TEXT NOT NULL,
    "isWeekend" BOOLEAN NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "isPayday" BOOLEAN NOT NULL,
    "festival" TEXT,
    "festivalRamp" DOUBLE PRECISION NOT NULL,
    "isHoliday" BOOLEAN NOT NULL,
    "monsoon" BOOLEAN NOT NULL,
    "isOperating" BOOLEAN NOT NULL,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "TrafficSpeed" (
    "districtId" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "monsoon" BOOLEAN NOT NULL,
    "speedIndex" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TrafficSpeed_pkey" PRIMARY KEY ("districtId","hour","monsoon")
);

-- CreateTable
CREATE TABLE "RoadCondition" (
    "date" DATE NOT NULL,
    "districtId" TEXT NOT NULL,
    "disruptionIndex" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RoadCondition_pkey" PRIMARY KEY ("date","districtId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "depotId" TEXT,
    "outletId" TEXT,
    "vehicleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "outletId" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "depotId" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "requestedDate" DATE NOT NULL,
    "temp" "TempRequirement" NOT NULL,
    "units" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "volumeM3" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "deferCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "volumeM3" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "engineVersion" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ,
    "publishedById" TEXT,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDecision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "decision" "Decision" NOT NULL,
    "source" "DecisionSource" NOT NULL DEFAULT 'ENGINE',
    "priorityScore" DOUBLE PRECISION NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "reason" "DeferralReason",
    "explanation" TEXT,
    "consecutiveDefers" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "overriddenById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripNo" INTEGER NOT NULL,
    "brand" "Brand" NOT NULL,
    "districtId" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedDepartMin" INTEGER NOT NULL,
    "plannedDurationMin" DOUBLE PRECISION NOT NULL,
    "plannedKm" DOUBLE PRECISION NOT NULL,
    "plannedFuelL" DOUBLE PRECISION NOT NULL,
    "loadWeightKg" DOUBLE PRECISION NOT NULL,
    "loadVolumeM3" DOUBLE PRECISION NOT NULL,
    "loadedAt" TIMESTAMPTZ,
    "loadedById" TEXT,
    "driverId" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "departedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "plannedArrivalMin" INTEGER NOT NULL,
    "plannedWaitMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedServiceMin" DOUBLE PRECISION NOT NULL,
    "etaMin" INTEGER,
    "etaUpdatedAt" TIMESTAMPTZ,
    "atRisk" BOOLEAN NOT NULL DEFAULT false,
    "riskReason" TEXT,
    "status" "StopStatus" NOT NULL DEFAULT 'PENDING',
    "loadStatus" "LoadStatus" NOT NULL DEFAULT 'PENDING',
    "arrivedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "Stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "stopId" TEXT,
    "driverId" TEXT NOT NULL,
    "type" "DeliveryEventType" NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "payload" JSONB,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofOfDelivery" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "notes" TEXT,
    "capturedAt" TIMESTAMPTZ NOT NULL,
    "signatureId" TEXT,
    "photoId" TEXT,

    CONSTRAINT "ProofOfDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLine" (
    "id" TEXT NOT NULL,
    "podId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "deliveredQty" INTEGER NOT NULL,
    "refusedQty" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,

    CONSTRAINT "DeliveryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ReceiptStatus" NOT NULL,
    "notes" TEXT,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "clientId" TEXT,
    "stage" "IssueStage" NOT NULL,
    "type" "IssueType" NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "quantity" INTEGER,
    "orderId" TEXT,
    "orderLineId" TEXT,
    "tripId" TEXT,
    "stopId" TEXT,
    "vehicleId" TEXT,
    "outletId" TEXT,
    "photoId" TEXT,
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "resolvedAt" TIMESTAMPTZ,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelLedgerEntry" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT,
    "date" DATE NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "kind" "FuelEntryKind" NOT NULL,
    "km" DOUBLE PRECISION NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandWeekly" (
    "depotId" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "totalVolumeM3" DOUBLE PRECISION NOT NULL,
    "chilledVolumeM3" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DemandWeekly_pkey" PRIMARY KEY ("depotId","brand","isoYear","isoWeek")
);

-- CreateTable
CREATE TABLE "DemandForecast" (
    "depotId" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "source" "ForecastSource" NOT NULL,
    "totalVolumeM3" DOUBLE PRECISION NOT NULL,
    "chilledVolumeM3" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("depotId","brand","isoYear","isoWeek","source")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Outlet_depotId_brand_districtId_idx" ON "Outlet"("depotId", "brand", "districtId");

-- CreateIndex
CREATE INDEX "Vehicle_depotId_temp_type_idx" ON "Vehicle"("depotId", "temp", "type");

-- CreateIndex
CREATE INDEX "CalendarDay_isoYear_isoWeek_idx" ON "CalendarDay"("isoYear", "isoWeek");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_vehicleId_key" ON "User"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_ref_key" ON "Order"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientRequestId_key" ON "Order"("clientRequestId");

-- CreateIndex
CREATE INDEX "Order_depotId_deliveryDate_status_idx" ON "Order"("depotId", "deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Order_outletId_deliveryDate_idx" ON "Order"("outletId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Plan_depotId_date_status_idx" ON "Plan"("depotId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_depotId_date_version_key" ON "Plan"("depotId", "date", "version");

-- CreateIndex
CREATE INDEX "PlanDecision_orderId_idx" ON "PlanDecision"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDecision_planId_orderId_key" ON "PlanDecision"("planId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_planId_vehicleId_tripNo_key" ON "Trip"("planId", "vehicleId", "tripNo");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_planId_ref_key" ON "Trip"("planId", "ref");

-- CreateIndex
CREATE INDEX "Stop_orderId_idx" ON "Stop"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Stop_tripId_seq_key" ON "Stop"("tripId", "seq");

-- CreateIndex
CREATE INDEX "DeliveryEvent_tripId_occurredAt_idx" ON "DeliveryEvent"("tripId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfDelivery_stopId_key" ON "ProofOfDelivery"("stopId");

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfDelivery_signatureId_key" ON "ProofOfDelivery"("signatureId");

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfDelivery_photoId_key" ON "ProofOfDelivery"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_orderId_key" ON "Receipt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_ref_key" ON "Issue"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_clientId_key" ON "Issue"("clientId");

-- CreateIndex
CREATE INDEX "Issue_status_stage_idx" ON "Issue"("status", "stage");

-- CreateIndex
CREATE INDEX "Issue_tripId_idx" ON "Issue"("tripId");

-- CreateIndex
CREATE INDEX "FuelLedgerEntry_vehicleId_isoYear_isoWeek_idx" ON "FuelLedgerEntry"("vehicleId", "isoYear", "isoWeek");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficSpeed" ADD CONSTRAINT "TrafficSpeed_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadCondition" ADD CONSTRAINT "RoadCondition_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDecision" ADD CONSTRAINT "PlanDecision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDecision" ADD CONSTRAINT "PlanDecision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDecision" ADD CONSTRAINT "PlanDecision_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_loadedById_fkey" FOREIGN KEY ("loadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofOfDelivery" ADD CONSTRAINT "ProofOfDelivery_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_podId_fkey" FOREIGN KEY ("podId") REFERENCES "ProofOfDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryLine" ADD CONSTRAINT "DeliveryLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLedgerEntry" ADD CONSTRAINT "FuelLedgerEntry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLedgerEntry" ADD CONSTRAINT "FuelLedgerEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandWeekly" ADD CONSTRAINT "DemandWeekly_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandForecast" ADD CONSTRAINT "DemandForecast_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
