import type { ReactNode } from "react";

export function PagePlaceholder({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="rounded-xl border border-dashed border-border bg-background p-12 text-center">
        {children ?? (
          <p className="text-sm text-muted-foreground">
            Coming next. The foundation for this section is ready.
          </p>
        )}
      </div>
    </section>
  );
}
