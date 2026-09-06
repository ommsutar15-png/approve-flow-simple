import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/app/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects | ApproveFlow" },
      { name: "description", content: "Campaigns and content programmes per client." },
      { property: "og:title", content: "Projects | ApproveFlow" },
      { property: "og:description", content: "Campaigns and content programmes per client." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Projects" description="Campaigns and content programmes per client." />;
}
