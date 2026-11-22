-- CreateEnum
CREATE TYPE "TaxiOrderStatus" AS ENUM ('DRAFT', 'NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "taxi_cities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distanceKm" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxi_cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxi_extra_services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surcharge" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCarFeature" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxi_extra_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxi_city_prices" (
    "id" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fromCityId" TEXT NOT NULL,
    "toCityId" TEXT NOT NULL,

    CONSTRAINT "taxi_city_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxi_departure_slots" (
    "id" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxi_departure_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxi_passenger_options" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxi_passenger_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxi_drivers" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxi_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxi_cars" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "color" TEXT,
    "seats" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,

    CONSTRAINT "taxi_cars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxi_orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TaxiOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "draftStep" INTEGER NOT NULL DEFAULT 1,
    "passengerCount" INTEGER,
    "serviceIds" JSONB,
    "priceBase" INTEGER,
    "priceTotal" INTEGER,
    "fromCityName" TEXT,
    "toCityName" TEXT,
    "departureSlotLabel" TEXT,
    "serviceSnapshot" JSONB,
    "carSnapshot" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fromCityId" TEXT,
    "toCityId" TEXT,
    "departureSlotId" TEXT,
    "carId" TEXT,

    CONSTRAINT "taxi_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CarFeatures" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CarFeatures_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "taxi_cities_name_key" ON "taxi_cities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "taxi_extra_services_name_key" ON "taxi_extra_services"("name");

-- CreateIndex
CREATE UNIQUE INDEX "taxi_city_prices_fromCityId_toCityId_key" ON "taxi_city_prices"("fromCityId", "toCityId");

-- CreateIndex
CREATE UNIQUE INDEX "taxi_departure_slots_time_key" ON "taxi_departure_slots"("time");

-- CreateIndex
CREATE UNIQUE INDEX "taxi_passenger_options_count_key" ON "taxi_passenger_options"("count");

-- CreateIndex
CREATE UNIQUE INDEX "taxi_cars_plate_key" ON "taxi_cars"("plate");

-- CreateIndex
CREATE INDEX "taxi_orders_userId_status_idx" ON "taxi_orders"("userId", "status");

-- CreateIndex
CREATE INDEX "taxi_orders_status_carId_idx" ON "taxi_orders"("status", "carId");

-- CreateIndex
CREATE INDEX "_CarFeatures_B_index" ON "_CarFeatures"("B");

-- AddForeignKey
ALTER TABLE "taxi_city_prices" ADD CONSTRAINT "taxi_city_prices_fromCityId_fkey" FOREIGN KEY ("fromCityId") REFERENCES "taxi_cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxi_city_prices" ADD CONSTRAINT "taxi_city_prices_toCityId_fkey" FOREIGN KEY ("toCityId") REFERENCES "taxi_cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxi_cars" ADD CONSTRAINT "taxi_cars_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "taxi_drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxi_orders" ADD CONSTRAINT "taxi_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxi_orders" ADD CONSTRAINT "taxi_orders_fromCityId_fkey" FOREIGN KEY ("fromCityId") REFERENCES "taxi_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxi_orders" ADD CONSTRAINT "taxi_orders_toCityId_fkey" FOREIGN KEY ("toCityId") REFERENCES "taxi_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxi_orders" ADD CONSTRAINT "taxi_orders_departureSlotId_fkey" FOREIGN KEY ("departureSlotId") REFERENCES "taxi_departure_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxi_orders" ADD CONSTRAINT "taxi_orders_carId_fkey" FOREIGN KEY ("carId") REFERENCES "taxi_cars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarFeatures" ADD CONSTRAINT "_CarFeatures_A_fkey" FOREIGN KEY ("A") REFERENCES "taxi_cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarFeatures" ADD CONSTRAINT "_CarFeatures_B_fkey" FOREIGN KEY ("B") REFERENCES "taxi_extra_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
