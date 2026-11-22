-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "telegramMessageId" INTEGER;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
