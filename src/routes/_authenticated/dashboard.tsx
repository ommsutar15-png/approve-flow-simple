import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/app/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | ApproveFlow" },
      { name: "description", content: "Pipeline overview and approvals awaiting your client." },
      { property: "og:title", content: "Dashboard | ApproveFlow" },
      { property: "og:description", content: "Pipeline overview and approvals awaiting your client." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Dashboard" description="Pipeline overview and approvals awaiting your client." />;
}
