import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, LoadingRows } from "@/components/app/PageHeader";
import { formatDateTime } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clients | ApproveFlow" },
      { name: "description", content: "Every client account your agency works with." },
      { property: "og:title", content: "Clients | ApproveFlow" },
      { property: "og:description", content: "Every client account your agency works with." },
    ],
  }),
  component: ClientsPage,
});

async function loadClients() {
  const [{ data: clients, error }, { data: projects }, { data: tasks }, { data: activity }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, company_name, email, phone, created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, client_id, status"),
      supabase.from("tasks").select("id, client_id, status"),
      supabase.from("activity_logs").select("created_at, task_id").order("created_at", { ascending: false }),
    ]);
  if (error) throw error;

  const taskClient = new Map((tasks ?? []).map((t) => [t.id, t.client_id]));
  const lastActivity = new Map<string, string>();
  for (const row of activity ?? []) {
    const clientId = row.task_id ? taskClient.get(row.task_id) : undefined;
    if (clientId && !lastActivity.has(clientId)) lastActivity.set(clientId, row.created_at);
  }

  return (clients ?? []).map((c) => ({
    ...c,
    activeProjects: (projects ?? []).filter((p) => p.client_id === c.id && p.status === "active").length,
    pendingApprovals: (tasks ?? []).filter(
      (t) => t.client_id === c.id && (t.status === "awaiting_client" || t.status === "changes_requested"),
    ).length,
    lastActivity: lastActivity.get(c.id) ?? null,
  }));
}

function ClientsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["clients"], queryFn: loadClients });

  const createClient = useMutation({
    mutationFn: async (form: { name: string; company: string; email: string; phone: string }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", (await supabase.auth.getUser()).data.user!.id)
        .maybeSingle();
      if (!profile?.organization_id) throw new Error("No organization found");
      const { error } = await supabase.from("clients").insert({
        organization_id: profile.organization_id,
        name: form.name,
        company_name: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client added");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Clients"
        description="Every client account your agency works with."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  createClient.mutate({
                    name: String(fd.get("name") ?? "").trim(),
                    company: String(fd.get("company") ?? "").trim(),
                    email: String(fd.get("email") ?? "").trim(),
                    phone: String(fd.get("phone") ?? "").trim(),
                  });
                }}
              >
                <DialogHeader>
                  <DialogTitle>New client</DialogTitle>
                  <DialogDescription>Add the account you will be sending content to.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-5">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" required placeholder="FarmerLift" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" name="company" placeholder="FarmerLift Pvt Ltd" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" placeholder="hello@farmerlift.com" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" placeholder="+91 98765 43210" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createClient.isPending}>
                    {createClient.isPending ? "Adding…" : "Add client"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <LoadingRows />
      ) : !data?.length ? (
        <EmptyState
          title="No clients yet"
          description="Add your first client to start organising projects, content and approvals."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Active projects</th>
                <th className="px-5 py-3 font-medium">Pending approvals</th>
                <th className="px-5 py-3 font-medium">Last activity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-4">
                    <Link to="/clients/$clientId" params={{ clientId: c.id }} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.company_name ?? "—"}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-5 py-4">{c.activeProjects}</td>
                  <td className="px-5 py-4">{c.pendingApprovals}</td>
                  <td className="px-5 py-4 text-muted-foreground">{formatDateTime(c.lastActivity)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link to="/clients/$clientId" params={{ clientId: c.id }}>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
