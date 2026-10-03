ALTER TYPE "MediaKind" ADD VALUE 'CHAT_BACKGROUND';

ALTER TABLE "Couple"
ADD COLUMN "chatBackgroundMediaId" TEXT;

CREATE UNIQUE INDEX "Couple_chatBackgroundMediaId_key" ON "Couple"("chatBackgroundMediaId");

ALTER TABLE "Couple" ADD CONSTRAINT "Couple_chatBackgroundMediaId_fkey"
FOREIGN KEY ("chatBackgroundMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
