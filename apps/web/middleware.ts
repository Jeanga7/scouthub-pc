import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { authorizedPartiesFromEnv } from "./src/identity/clerk-middleware-config";
import { isLocalIdentityMode } from "./src/identity/local-mode";

const localIdentity = isLocalIdentityMode(process.env);
const clerk = localIdentity ? null : clerkMiddleware({
  // The allowlist is explicit configuration, never derived from request Host.
  authorizedParties: authorizedPartiesFromEnv(process.env)
});

export default localIdentity
  ? function localMiddleware(_request: NextRequest) {
      void _request;
      return NextResponse.next();
    }
  : clerk!;


export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)"
  ]
};
