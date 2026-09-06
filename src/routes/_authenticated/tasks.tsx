import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/app/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks | ApproveFlow" },
      { name: "description", content: "Content pieces moving through review and approval." },
      { property: "og:title", content: "Tasks | ApproveFlow" },
      { property: "og:description", content: "Content pieces moving through review and approval." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Tasks" description="Content pieces moving through review and approval." />;
}
