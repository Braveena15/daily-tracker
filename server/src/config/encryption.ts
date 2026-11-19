// The app's encrypter for private text, using DIARY_ENCRYPTION_KEY (checked at startup in env.ts).
import { createFieldCrypto } from "../utils/crypto";
import { env } from "./env";

export const fieldCrypto = createFieldCrypto(env.DIARY_ENCRYPTION_KEY);
