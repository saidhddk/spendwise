-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "confirmedAt" DATETIME,
    "lastCategoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "idHash" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "KnownDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "bindingHash" TEXT NOT NULL,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Challenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMillimes" BIGINT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "detail" TEXT
);

-- CreateTable
CREATE TABLE "LoginFailure" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "emailKey" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "deviceKey" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmailSend" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "addressKey" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeletedAccount" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnownDevice_userId_deviceHash_key" ON "KnownDevice"("userId", "deviceHash");

-- CreateIndex
CREATE UNIQUE INDEX "Token_tokenHash_key" ON "Token"("tokenHash");

-- CreateIndex
CREATE INDEX "Token_userId_purpose_idx" ON "Token"("userId", "purpose");

-- CreateIndex
CREATE INDEX "Challenge_bindingHash_purpose_idx" ON "Challenge"("bindingHash", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_nameKey_key" ON "Category"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_at_idx" ON "SecurityEvent"("type", "at");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_at_idx" ON "SecurityEvent"("userId", "at");

-- CreateIndex
CREATE INDEX "SecurityEvent_ip_at_idx" ON "SecurityEvent"("ip", "at");

-- CreateIndex
CREATE INDEX "LoginFailure_emailKey_at_idx" ON "LoginFailure"("emailKey", "at");

-- CreateIndex
CREATE INDEX "LoginFailure_ip_at_idx" ON "LoginFailure"("ip", "at");

-- CreateIndex
CREATE INDEX "LoginFailure_at_idx" ON "LoginFailure"("at");

-- CreateIndex
CREATE INDEX "EmailSend_addressKey_at_idx" ON "EmailSend"("addressKey", "at");

-- CreateIndex
CREATE INDEX "EmailSend_userId_kind_at_idx" ON "EmailSend"("userId", "kind", "at");

-- CreateIndex
CREATE INDEX "EmailSend_ip_at_idx" ON "EmailSend"("ip", "at");

-- NFR-15: the security log is append-only for the application. UPDATE is always refused;
-- DELETE is refused for entries younger than 90 days (the retention period).
-- Prisma stores DateTime in SQLite as milliseconds since 1970.
CREATE TRIGGER "SecurityEvent_no_update" BEFORE UPDATE ON "SecurityEvent"
BEGIN
    SELECT RAISE(ABORT, 'SecurityEvent is append-only (NFR-15)');
END;

CREATE TRIGGER "SecurityEvent_keep_90_days" BEFORE DELETE ON "SecurityEvent"
WHEN OLD."at" > (CAST(strftime('%s', 'now', '-90 days') AS INTEGER) * 1000)
BEGIN
    SELECT RAISE(ABORT, 'SecurityEvent entries are kept for 90 days (NFR-15)');
END;

-- FR-09: predefined categories, shared and read-only (userId is NULL).
INSERT INTO "Category" ("id", "userId", "name", "nameKey", "createdAt") VALUES
    ('8efe86ad-ee19-4f65-af6d-293de97d4af8', NULL, 'Food', 'food', 0),
    ('dec991c2-9a8b-4818-963a-e7ec54bfe2d3', NULL, 'Transport', 'transport', 0),
    ('b201baa6-4f31-43f1-8aa6-9c2535c00f2f', NULL, 'Bills', 'bills', 0),
    ('fce12b91-ce00-474e-892a-6c0888ee3e2e', NULL, 'Health', 'health', 0),
    ('bda03fbd-ecf3-4adb-85bd-1fdb0b4a936c', NULL, 'Shopping', 'shopping', 0),
    ('41896d47-0c3b-4b4d-a620-7094de9c93db', NULL, 'Leisure', 'leisure', 0),
    ('a70b6d9a-5e88-4671-bf3b-ad924ec5e27f', NULL, 'Savings', 'savings', 0),
    ('9cd41fef-60b0-4e17-b658-d1948751fd87', NULL, 'Salary', 'salary', 0),
    ('da849733-5fdc-4950-bc58-76117c49497f', NULL, 'Allowance', 'allowance', 0),
    ('edb89f93-ccb9-41a4-8dc7-e56a3363582d', NULL, 'Other income', 'other income', 0);
