import { NextResponse } from "next/server";
import { LOCAL_PERSONA_COOKIE } from "@scouthub/infrastructure";
import { isLocalPersonaSelector } from "@/identity/local-personas";
import { isLocalIdentityMode } from "@/identity/local-mode";

export async function POST(request: Request) {
  if (!isLocalIdentityMode(process.env)) {
    return new Response("Not found", { status: 404 });
  }
  const form = await request.formData();
  const selector = form.get("persona");
  if (typeof selector !== "string" || !isLocalPersonaSelector(selector)) {
    return new Response("Profil local inconnu", { status: 400 });
  }
  const response = NextResponse.redirect(new URL("/app", request.url), 303);
  response.cookies.set(LOCAL_PERSONA_COOKIE, selector, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false
  });
  return response;
}

export function DELETE() {
  if (!isLocalIdentityMode(process.env)) {
    return new Response("Not found", { status: 404 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LOCAL_PERSONA_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
