import { api, json } from "@/lib/http";
import { listQuery, transactionBody } from "@/modules/transactions/validation";
import { createTransaction, listTransactions } from "@/modules/transactions/service";

export const GET = api({ auth: true, limit: true, query: listQuery }, async ({ auth, query }) =>
  json(await listTransactions(auth.userId, query)),
);

export const POST = api({ auth: true, limit: true, body: transactionBody }, async ({ auth, body, ip }) =>
  json(await createTransaction(auth.userId, body, ip), 201),
);
