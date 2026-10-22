/**
 * apps/api/src/index.ts
 * Entry point – boots the Express server.
 */

import "dotenv/config";
import "express-async-errors";
import { createApp } from "./app.js";

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);

const app = createApp();

app.listen(PORT, () => {
  console.log(`🚀  TGlobal Gold Loan API listening on http://localhost:${PORT}`);
});
