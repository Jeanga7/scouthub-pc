import { clerkMiddleware } from "@clerk/nextjs/server";
import { authorizedPartiesFromEnv } from "./src/identity/clerk-middleware-config";

const authorizedParties = authorizedPartiesFromEnv(process.env);

export default clerkMiddleware({
  // The allowlist is explicit configuration, never derived from request Host.
  authorizedParties
});


export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)"
  ]
};
