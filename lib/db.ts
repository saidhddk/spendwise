import { PrismaClient } from "@prisma/client";

// Prisma client. The login (VULN-15) and the transaction search (VULN-05) use $queryRawUnsafe on purpose.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
