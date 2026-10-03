CREATE TYPE "Gender" AS ENUM ('UNSPECIFIED', 'MALE', 'FEMALE', 'OTHER');

ALTER TABLE "User"
ADD COLUMN "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED';

CREATE TABLE "Anniversary" (
    "id" TEXT NOT NULL,
    "coupleId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "date" DATE NOT NULL,
    "note" VARCHAR(500),
    "annual" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anniversary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Anniversary_coupleId_date_idx" ON "Anniversary"("coupleId", "date");

ALTER TABLE "Anniversary" ADD CONSTRAINT "Anniversary_coupleId_fkey"
FOREIGN KEY ("coupleId") REFERENCES "Couple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Anniversary" ADD CONSTRAINT "Anniversary_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
