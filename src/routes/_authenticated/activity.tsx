import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/app/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity | ApproveFlow" },
      { name: "description", content: "Every version, comment and decision, in order." },
      { property: "og:title", content: "Activity | ApproveFlow" },
      { property: "og:description", content: "Every version, comment and decision, in order." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Activity" description="Every version, comment and decision, in order." />;
}
