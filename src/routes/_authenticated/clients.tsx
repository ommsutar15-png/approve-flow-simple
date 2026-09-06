import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/app/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients | ApproveFlow" },
      { name: "description", content: "Every client account your agency works with." },
      { property: "og:title", content: "Clients | ApproveFlow" },
      { property: "og:description", content: "Every client account your agency works with." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Clients" description="Every client account your agency works with." />;
}
