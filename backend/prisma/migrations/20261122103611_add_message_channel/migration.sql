-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WEB', 'TELEGRAM');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "botName" TEXT,
ADD COLUMN     "channel" "MessageChannel",
ADD COLUMN     "operatorEmail" TEXT;
