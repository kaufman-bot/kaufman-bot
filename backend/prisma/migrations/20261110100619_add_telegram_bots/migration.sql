-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telegramBotId" TEXT,
ADD COLUMN     "telegramChatId" TEXT;

-- CreateTable
CREATE TABLE "telegram_bots" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botUsername" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecret" TEXT NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_binding_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramBotId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_binding_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_bots_ownerId_idx" ON "telegram_bots"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_binding_tokens_token_key" ON "telegram_binding_tokens"("token");

-- CreateIndex
CREATE INDEX "telegram_binding_tokens_userId_idx" ON "telegram_binding_tokens"("userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_telegramBotId_fkey" FOREIGN KEY ("telegramBotId") REFERENCES "telegram_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_bots" ADD CONSTRAINT "telegram_bots_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
