-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'ru');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'en';
