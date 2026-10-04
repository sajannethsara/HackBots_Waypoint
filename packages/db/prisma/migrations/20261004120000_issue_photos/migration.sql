-- CreateTable
CREATE TABLE "IssuePhoto" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IssuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssuePhoto_mediaId_key" ON "IssuePhoto"("mediaId");

-- CreateIndex
CREATE INDEX "IssuePhoto_issueId_position_idx" ON "IssuePhoto"("issueId", "position");

-- AddForeignKey
ALTER TABLE "IssuePhoto" ADD CONSTRAINT "IssuePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePhoto" ADD CONSTRAINT "IssuePhoto_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
