import { api, json } from "@/lib/http";
import { transactionBody } from "@/modules/transactions/validation";
import { deleteTransaction, getTransaction, updateTransaction } from "@/modules/transactions/service";

export const GET = api({ auth: true, limit: true }, async ({ auth, params, ip }) =>
  json(await getTransaction(auth.userId, params.id, ip)),
);

export const PUT = api({ auth: true, limit: true, body: transactionBody }, async ({ auth, params, body, ip }) =>
  json(await updateTransaction(auth.userId, params.id, body, ip)),
);

export const DELETE = api({ auth: true, limit: true }, async ({ auth, params, ip }) => {
  await deleteTransaction(auth.userId, params.id, ip);
  return json({ status: "deleted" });
});
