/*
  Warnings:

  - Added the required column `pay` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "pay" DECIMAL(12,2) NOT NULL;
