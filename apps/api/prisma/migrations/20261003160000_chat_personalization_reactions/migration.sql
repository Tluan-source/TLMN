ALTER TABLE "User"
ADD COLUMN "chatNickname" VARCHAR(32),
ADD COLUMN "chatIcon" VARCHAR(16) NOT NULL DEFAULT '💗';

ALTER TABLE "Couple"
ADD COLUMN "chatBackground" VARCHAR(7) NOT NULL DEFAULT '#fff7fb';

CREATE TABLE "StoryEntryReaction" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryEntryReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoryEntryReaction_entryId_userId_key" ON "StoryEntryReaction"("entryId", "userId");
CREATE INDEX "StoryEntryReaction_entryId_idx" ON "StoryEntryReaction"("entryId");

ALTER TABLE "StoryEntryReaction" ADD CONSTRAINT "StoryEntryReaction_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "StoryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryEntryReaction" ADD CONSTRAINT "StoryEntryReaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reminder_status_scheduledAt_idx" ON "Reminder"("status", "scheduledAt");
CREATE INDEX "Reminder_coupleId_status_scheduledAt_idx" ON "Reminder"("coupleId", "status", "scheduledAt");

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_coupleId_fkey"
FOREIGN KEY ("coupleId") REFERENCES "Couple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
