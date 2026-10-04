CREATE TYPE "LoginEvent" AS ENUM ('REGISTER', 'LOGIN', 'LOGIN_FAILED');

CREATE TABLE "LoginLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "event" "LoginEvent" NOT NULL,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginLog_createdAt_idx" ON "LoginLog"("createdAt");

CREATE INDEX "LoginLog_userId_createdAt_idx" ON "LoginLog"("userId", "createdAt");

ALTER TABLE "LoginLog" ADD CONSTRAINT "LoginLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
