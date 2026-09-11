import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="page auth-page">
      <SignIn fallbackRedirectUrl="/app" />
    </main>
  );
}
