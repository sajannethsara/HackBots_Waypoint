-- CreateTable
CREATE TABLE "IssueChat" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "closedAt" TIMESTAMPTZ,
    "closedById" TEXT,
    "lastMessageAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueChatMember" (
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueChatMember_pkey" PRIMARY KEY ("chatId","userId")
);

-- CreateTable
CREATE TABLE "IssueChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueChat_issueId_key" ON "IssueChat"("issueId");

-- CreateIndex
CREATE INDEX "IssueChat_depotId_lastMessageAt_idx" ON "IssueChat"("depotId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "IssueChatMember_userId_idx" ON "IssueChatMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueChatMessage_clientId_key" ON "IssueChatMessage"("clientId");

-- CreateIndex
CREATE INDEX "IssueChatMessage_chatId_createdAt_idx" ON "IssueChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "IssueChat" ADD CONSTRAINT "IssueChat_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueChatMember" ADD CONSTRAINT "IssueChatMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "IssueChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueChatMember" ADD CONSTRAINT "IssueChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueChatMessage" ADD CONSTRAINT "IssueChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "IssueChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueChatMessage" ADD CONSTRAINT "IssueChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
