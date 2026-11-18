// Use public DNS servers so the mongodb+srv:// lookup works on networks whose DNS blocks SRV records.
// This must run before anything connects to MongoDB.
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import { env } from "./config/env";
import { connectDB } from "./config/db";
import { app } from "./app";

void connectDB();

app.listen(env.PORT, () => console.log(`🚀 Server running on http://localhost:${env.PORT}`));
