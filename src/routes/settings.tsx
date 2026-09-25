import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Knowledge Brain" },
      { name: "description", content: "Manage your Knowledge Brain profile and account." },
      { property: "og:title", content: "Settings — Knowledge Brain" },
      { property: "og:description", content: "Manage your Knowledge Brain profile and account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { session, user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile?.display_name]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, display_name: displayName.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title="Settings" description="Your account and profile.">
      <div className="panel max-w-xl space-y-4 p-6">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={user?.email ?? ""} readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should the brain address you?"
          />
        </div>
        <div className="flex gap-2">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="panel mt-5 max-w-xl p-6">
        <h2 className="text-sm font-semibold">Privacy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          All knowledge, conversations, sources and history in this app are private to your account and
          enforced at the database level — no other account can read or change them.
        </p>
      </div>
    </AppShell>
  );
}
