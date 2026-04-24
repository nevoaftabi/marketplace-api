-- DropForeignKey
ALTER TABLE "Claim" DROP CONSTRAINT "Claim_taskId_fkey";

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
