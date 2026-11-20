import app from "../server/index.js";
import { initializeDatabase } from "../server/db.js";

export default async function handler(req, res) {
  await initializeDatabase();
  if (!req.url.startsWith("/api/")) req.url = `/api${req.url}`;
  return app(req, res);
}
