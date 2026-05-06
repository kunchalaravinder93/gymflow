import { useState } from "react";
import { useListPlans, useCreatePlan, useUpdatePlan, useDeletePlan } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Users, DollarSign, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type PlanForm = { name: string; description: string; price: string; durationDays: string; benefits: string; isActive: boolean };
const emptyForm: PlanForm = { name: "", description: "", price: "", durationDays: "30", benefits: "", isActive: true };

export default function Plans() {
  const { data: plans = [], isLoading } = useListPlans();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  function openCreate() { setEditId(null); setForm(emptyForm); setOpen(true); }
  function openEdit(plan: any) {
    setEditId(plan.id);
    setForm({ name: plan.name, description: plan.description ?? "", price: String(plan.price), durationDays: String(plan.durationDays), benefits: plan.benefits ?? "", isActive: plan.isActive });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { name: form.name, description: form.description || undefined, price: parseFloat(form.price), durationDays: parseInt(form.durationDays), benefits: form.benefits || undefined, isActive: form.isActive };
    try {
      if (editId) {
        await updatePlan.mutateAsync({ id: editId, data });
        toast({ title: "Plan updated" });
      } else {
        await createPlan.mutateAsync({ data: data as any });
        toast({ title: "Plan created" });
      }
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
    } catch {
      toast({ title: "Failed to save plan", variant: "destructive" });
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete plan "${name}"? Members on this plan will lose their plan assignment.`)) return;
    try {
      await deletePlan.mutateAsync({ id });
      toast({ title: "Plan deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
    } catch {
      toast({ title: "Failed to delete plan", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Membership Plans</h1>
          <p className="text-muted-foreground">Create and manage membership plans for your gym.</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Plan</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading plans...</div>
      ) : plans.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <p className="text-muted-foreground mb-4">No plans yet. Create your first membership plan.</p>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Create Plan</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.map(plan => (
            <Card key={plan.id} className={plan.isActive ? "" : "opacity-60"}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <Badge variant={plan.isActive ? "default" : "secondary"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                {plan.description && <CardDescription>{plan.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-muted rounded-lg p-2">
                    <DollarSign className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="font-bold text-sm">₹{plan.price}</div>
                    <div className="text-xs text-muted-foreground">Price</div>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="font-bold text-sm">{plan.durationDays}d</div>
                    <div className="text-xs text-muted-foreground">Duration</div>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="font-bold text-sm">{plan.memberCount ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Members</div>
                  </div>
                </div>
                {plan.benefits && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Benefits</div>
                    <p className="text-sm">{plan.benefits}</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(plan.id, plan.name)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Plan" : "Create Plan"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Plan Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Monthly Basic" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price (USD) *</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required placeholder="49.99" />
              </div>
              <div className="space-y-2">
                <Label>Duration (days) *</Label>
                <Input type="number" min="1" value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))} required placeholder="30" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
            </div>
            <div className="space-y-2">
              <Label>Benefits</Label>
              <Textarea value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))} placeholder="List of benefits included..." rows={3} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>Active (visible to new members)</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createPlan.isPending || updatePlan.isPending}>
                {editId ? "Save Changes" : "Create Plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
