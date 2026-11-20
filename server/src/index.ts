import dns from "node:dns";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { app } from "./app";

// Development only: use public DNS servers so the mongodb+srv:// lookup works on home networks whose
// DNS blocks SRV records. Hosts like Render have working DNS, so production leaves it alone.
// Must run before connecting to MongoDB.
if (!env.isProduction) dns.setServers(["8.8.8.8", "1.1.1.1"]);

void connectDB();

if (env.isProduction) {
  // Render tells the app which port to use (PORT); its proxy handles https
  app.listen(env.PORT, "0.0.0.0", () => console.log(`🚀 Server listening on port ${env.PORT}`));
} else {
  // 0.0.0.0 = every network interface, so a phone on the same Wi-Fi can reach the server during development
  // (at http://<this computer's Wi-Fi IP>:PORT). Your firewall may ask to allow Node the first time.
  app.listen(env.PORT, "0.0.0.0", () => console.log(`🚀 Server running on http://localhost:${env.PORT} (and on your local network)`));
}
