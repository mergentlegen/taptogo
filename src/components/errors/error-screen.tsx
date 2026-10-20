import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";

type ErrorScreenProps = {
  code: string;
  title: string;
  description: string;
  children?: ReactNode;
};

/** Shared look for 404/500 pages. Works in both server and client components. */
export function ErrorScreen({ code, title, description, children }: ErrorScreenProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <Logo />
      <div className="flex flex-col items-center gap-3">
        <p className="font-mono text-6xl font-bold tracking-tight text-primary sm:text-7xl">{code}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="max-w-md text-balance text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex flex-wrap justify-center gap-3">{children}</div>}
    </main>
  );
}
