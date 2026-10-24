-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEB_FORM', 'AI_AGENT');

-- CreateTable
CREATE TABLE "loan_schemes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interestRatePa" DECIMAL(5,2) NOT NULL,
    "maxLtvPercent" DECIMAL(5,2) NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "grossWeightGrams" DECIMAL(10,3) NOT NULL,
    "netWeightGrams" DECIMAL(10,3) NOT NULL,
    "karat" INTEGER NOT NULL,
    "pureGoldGrams" DECIMAL(10,4) NOT NULL,
    "rate24kPaise" BIGINT NOT NULL,
    "goldValuePaise" BIGINT NOT NULL,
    "eligibleLoanPaise" BIGINT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'SUBMITTED',
    "source" "LeadSource" NOT NULL DEFAULT 'WEB_FORM',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_applicationId_key" ON "leads"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_idempotencyKey_key" ON "leads"("idempotencyKey");

-- CreateIndex
CREATE INDEX "leads_mobileNumber_idx" ON "leads"("mobileNumber");

-- CreateIndex
CREATE INDEX "audit_logs_leadId_idx" ON "audit_logs"("leadId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_planId_fkey" FOREIGN KEY ("planId") REFERENCES "loan_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
