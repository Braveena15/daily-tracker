// Use public DNS servers so the mongodb+srv:// lookup works on networks whose DNS blocks SRV records.
// This must run before anything connects to MongoDB.
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import { env } from "./config/env";
import { connectDB } from "./config/db";
import { app } from "./app";

void connectDB();

// 0.0.0.0 = every network interface, so a phone on the same Wi-Fi can reach the server during development
// (at http://<this computer's Wi-Fi IP>:PORT). Your firewall may ask to allow Node the first time.
app.listen(env.PORT, "0.0.0.0", () => console.log(`🚀 Server running on http://localhost:${env.PORT} (and on your local network)`));
