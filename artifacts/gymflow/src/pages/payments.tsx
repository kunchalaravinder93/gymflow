import { useState } from "react";
import { useListPayments, useCreatePayment, useListMembers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const methods = ["cash", "card", "upi", "bank_transfer", "other"];
const methodLabel: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI", bank_transfer: "Bank Transfer", other: "Other" };

export default function Payments() {
  const { data: payments = [], isLoading } = useListPayments({});
  const { data: members = [] } = useListMembers({});
  const createPayment = useCreatePayment();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ memberId: "", amount: "", method: "card", notes: "", paidAt: new Date().toISOString().split("T")[0] });

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createPayment.mutateAsync({
        data: {
          memberId: parseInt(form.memberId),
          amount: parseFloat(form.amount),
          method: form.method as any,
          notes: form.notes || undefined,
          paidAt: form.paidAt,
        }
      });
      toast({ title: "Payment recorded" });
      setOpen(false);
      setForm({ memberId: "", amount: "", method: "card", notes: "", paidAt: new Date().toISOString().split("T")[0] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">Track all payment transactions.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Record Payment</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">₹{totalRevenue.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Total Revenue</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  ₹{payments.filter(p => p.paidAt >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]).reduce((s, p) => s + Number(p.amount), 0).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">This Month</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{payments.length}</div>
                <div className="text-xs text-muted-foreground">Total Transactions</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading payments...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Member</th>
                    <th className="text-left px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">Method</th>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted-foreground py-12">No payments recorded</td></tr>
                  ) : [...payments].reverse().map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.memberName ?? `Member #${p.memberId}`}</td>
                      <td className="px-4 py-3 font-bold text-green-600">₹{Number(p.amount).toFixed(2)}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{methodLabel[p.method] ?? p.method}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{p.paidAt}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Member *</Label>
              <Select value={form.memberId} onValueChange={v => setForm(f => ({ ...f, memberId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (₹) *</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required placeholder="49.99" />
              </div>
              <div className="space-y-2">
                <Label>Method *</Label>
                <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {methods.map(m => <SelectItem key={m} value={m}>{methodLabel[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input type="date" value={form.paidAt} onChange={e => setForm(f => ({ ...f, paidAt: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createPayment.isPending || !form.memberId || !form.amount}>
                {createPayment.isPending ? "Saving..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
