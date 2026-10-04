-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('IDLE', 'THINKING', 'WAITING', 'PLAN_READY', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('PROPOSED', 'DONE', 'SKIPPED', 'FAILED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "IssueAgent" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'IDLE',
    "diagnosis" TEXT,
    "waitingFor" TEXT,
    "waitingSince" TIMESTAMPTZ,
    "error" TEXT,
    "plan" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMPTZ,
    "startedById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "IssueAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueAgentStep" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "plan" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'PROPOSED',
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueAgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueAgentNote" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueAgentNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueAgent_issueId_key" ON "IssueAgent"("issueId");

-- CreateIndex
CREATE INDEX "IssueAgentStep_agentId_plan_seq_idx" ON "IssueAgentStep"("agentId", "plan", "seq");

-- CreateIndex
CREATE INDEX "IssueAgentNote_agentId_createdAt_idx" ON "IssueAgentNote"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "IssueAgent" ADD CONSTRAINT "IssueAgent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAgentStep" ADD CONSTRAINT "IssueAgentStep_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "IssueAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAgentNote" ADD CONSTRAINT "IssueAgentNote_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "IssueAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
