import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/app/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals | ApproveFlow" },
      { name: "description", content: "A permanent record of client decisions." },
      { property: "og:title", content: "Approvals | ApproveFlow" },
      { property: "og:description", content: "A permanent record of client decisions." },
    ],
  }),
  component: Page,
});

function Page() {
  return <PagePlaceholder title="Approvals" description="A permanent record of client decisions." />;
}
