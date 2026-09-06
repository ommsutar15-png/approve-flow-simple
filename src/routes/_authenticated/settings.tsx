import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/app/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings | ApproveFlow" },
      { name: "description", content: "Agency profile, team and workspace preferences." },
      { property: "og:title", content: "Settings | ApproveFlow" },
      { property: "og:description", content: "Agency profile, team and workspace preferences." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Settings" description="Agency profile, team and workspace preferences." />;
}
