-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'BUTTON');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "buttons" JSONB,
ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'TEXT';
