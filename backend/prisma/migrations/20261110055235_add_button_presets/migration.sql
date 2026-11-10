-- CreateTable
CREATE TABLE "button_presets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buttons" JSONB NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "button_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "button_presets_ownerId_idx" ON "button_presets"("ownerId");

-- AddForeignKey
ALTER TABLE "button_presets" ADD CONSTRAINT "button_presets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
