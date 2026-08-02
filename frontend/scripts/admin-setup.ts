/**
 * Makes a secret for the admin page and prints what to do with it.
 *
 * Run once. The secret goes in .env.local and into an authenticator app, and after that
 * the six digit code is the only way into /admin.
 */
import { newSecret, otpauthUri } from "../lib/totp";

const secret = newSecret();
console.log("\nPut this in frontend/.env.local:\n");
console.log(`ADMIN_TOTP_SECRET=${secret}\n`);
console.log("Then add it to Google Authenticator. Either scan a QR made from this link,");
console.log("or use 'enter a setup key' and paste the secret above.\n");
console.log(otpauthUri(secret));
console.log("\nRestart npm run dev afterwards, then open /admin.\n");
