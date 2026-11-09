import { api, json } from "@/lib/http";
import { categoryBody, createCategory, listCategories } from "@/modules/categories/service";

export const GET = api({ auth: true, limit: true }, async ({ auth }) => json(await listCategories(auth.userId)));

export const POST = api({ auth: true, limit: true, body: categoryBody }, async ({ auth, body, ip }) =>
  json(await createCategory(auth.userId, body.name, ip), 201),
);
