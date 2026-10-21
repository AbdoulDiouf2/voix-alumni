import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { auth, database } from "./auth.js";

const app = createApp({ auth, database });

const port = Number(process.env.API_PORT ?? 8787);
const hostname = process.env.API_HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  process.stdout.write(
    `voix-alumni-api listening on ${hostname}:${info.port}\n`,
  );
});
