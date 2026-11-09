import { PrismaClient } from "@prisma/client";

// All database access goes through Prisma's query API with bound parameters (NFR-03).
// $queryRawUnsafe / $executeRawUnsafe are banned by the lint rule in eslint.config.mjs.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
