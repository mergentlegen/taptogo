import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Centered card used by sign-in, password and invitation pages. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-12 sm:py-16">
      <Card>
        <CardHeader className="text-center">
          <LogoMark className="mx-auto mb-2 size-10" />
          <CardTitle className="text-xl">
            <h1>{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer}
    </div>
  );
}
