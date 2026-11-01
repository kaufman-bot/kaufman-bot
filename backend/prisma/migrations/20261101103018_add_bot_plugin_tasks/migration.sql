-- CreateEnum
CREATE TYPE "BotPluginTaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE');

-- CreateTable
CREATE TABLE "bot_plugin_tasks" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "BotPluginTaskStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_plugin_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_plugin_tasks_messageId_key" ON "bot_plugin_tasks"("messageId");

-- CreateIndex
CREATE INDEX "bot_plugin_tasks_status_updatedAt_idx" ON "bot_plugin_tasks"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "bot_plugin_tasks" ADD CONSTRAINT "bot_plugin_tasks_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
