import { createFileRoute } from "@tanstack/react-router";
import { SignInPanel } from "@/components/vela/signin";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg px-6 py-10 text-paper">
      <SignInPanel />
    </main>
  );
}
