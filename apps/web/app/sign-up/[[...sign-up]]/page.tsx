import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="page auth-page">
      <SignUp />
    </main>
  );
}

