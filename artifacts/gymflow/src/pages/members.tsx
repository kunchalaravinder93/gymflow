import { useState, useRef } from "react";
import { useListMembers, useCreateMember, useDeleteMember, useCheckInMember, useListPlans, useRenewMember } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Search, UserCheck, Trash2, Eye, Camera, X, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  expired: "destructive",
  pending: "secondary",
};

function MemberAvatar({ photo, name, size = "sm" }: { photo?: string | null; name: string; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "h-20 w-20 text-2xl" : "h-9 w-9 text-sm";
  const initials = name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  if (photo) {
    return <img src={photo} alt={name} className={cn("rounded-full object-cover shrink-0 bg-muted", dim)} />;
  }
  return (
    <div className={cn("rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0", dim)}>
      {initials}
    </div>
  );
}

function PhotoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {value ? (
          <img src={value} alt="Preview" className="h-20 w-20 rounded-full object-cover border-2 border-border" />
        ) : (
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-border">
            <Camera className="h-7 w-7 text-muted-foreground" />
          </div>
        )}
        <button type="button" onClick={() => inputRef.current?.click()}
          className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:bg-primary/90 transition-colors">
          <Camera className="h-3.5 w-3.5" />
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")}
            className="absolute top-0 right-0 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Profile photo</p>
        <p>JPG, PNG or GIF — max 2MB</p>
        <button type="button" onClick={() => inputRef.current?.click()} className="text-primary underline underline-offset-2 text-xs">
          Upload photo
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

const emptyForm = { name: "", email: "", phone: "", planId: "", startDate: "", profilePhoto: "" };

type MemberRow = { id: number; name: string; planId?: number | null; planName?: string | null; membershipStatus: string };

export default function Members() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [renewTarget, setRenewTarget] = useState<MemberRow | null>(null);
  const [renewForm, setRenewForm] = useState({ planId: "", amount: "", paymentMethod: "cash", startDate: "" });

  const [qrTarget, setQrTarget] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [portalUrl, setPortalUrl] = useState<string>("");
  const [isLoadingQr, setIsLoadingQr] = useState(false);

  function getDaysRemaining(endDateStr: string | null) {
    if (!endDateStr) return null;
    const end = new Date(endDateStr);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  async function openQrDialog(m: any) {
    setQrTarget(m);
    setIsLoadingQr(true);
    setPortalUrl("");
    try {
      // Generate standard Check-in QR using member ID
      const dataUrl = await QRCode.toDataURL(m.id.toString(), { margin: 2, width: 200 });
      setQrDataUrl(dataUrl);

      // Fetch portal token
      const res = await fetch(`/api/member-portal/token/${m.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("gymflow_token")}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPortalUrl(data.portalUrl);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to load QR code", variant: "destructive" });
    } finally {
      setIsLoadingQr(false);
    }
  }

  const { data: members = [], isLoading } = useListMembers({
    search: search || undefined,
    status: (statusFilter !== "all" ? statusFilter : undefined) as any,
  });
  const { data: plans = [] } = useListPlans();
  const createMember = useCreateMember();
  const deleteMember = useDeleteMember();
  const checkIn = useCheckInMember();
  const renewMember = useRenewMember();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  function openRenew(m: MemberRow) {
    const plan = plans.find(p => p.id === m.planId);
    setRenewForm({
      planId: m.planId ? String(m.planId) : (plans[0] ? String(plans[0].id) : ""),
      amount: plan ? String(plan.price) : "",
      paymentMethod: "cash",
      startDate: new Date().toISOString().split("T")[0],
    });
    setRenewTarget(m);
  }

  function handleRenewPlanChange(planId: string) {
    const plan = plans.find(p => p.id === parseInt(planId));
    setRenewForm(f => ({ ...f, planId, amount: plan ? String(plan.price) : f.amount }));
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!renewTarget) return;
    try {
      await renewMember.mutateAsync({
        id: renewTarget.id,
        data: {
          planId: parseInt(renewForm.planId),
          amount: parseFloat(renewForm.amount),
          paymentMethod: renewForm.paymentMethod as any,
          startDate: renewForm.startDate || undefined,
        },
      });
      toast({ title: "Membership renewed", description: `${renewTarget.name}'s membership is now active.` });
      setRenewTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    } catch {
      toast({ title: "Renewal failed", variant: "destructive" });
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createMember.mutateAsync({
        data: {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          planId: form.planId ? parseInt(form.planId) : undefined,
          startDate: form.startDate || undefined,
          profilePhoto: form.profilePhoto || undefined,
        }
      });
      toast({ title: "Member added successfully" });
      setAddOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
    } catch {
      toast({ title: "Failed to add member", variant: "destructive" });
    }
  }

  async function handleCheckIn(id: number, name: string) {
    try {
      const result = await checkIn.mutateAsync({ id });
      toast({
        title: result.allowed ? "Check-in successful" : "Check-in denied",
        description: result.allowed ? `${name} is checked in` : result.message,
        variant: result.allowed ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
    } catch {
      toast({ title: "Check-in failed", variant: "destructive" });
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete member ${name}?`)) return;
    try {
      await deleteMember.mutateAsync({ id });
      toast({ title: "Member deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
    } catch {
      toast({ title: "Failed to delete member", variant: "destructive" });
    }
  }

  const selectedPlan = plans.find(p => p.id === parseInt(renewForm.planId));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">Manage gym members and memberships.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Add Member
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, phone..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading members...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium w-10"></th>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Plan</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Expiry</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted-foreground py-12">No members found</td>
                    </tr>
                  ) : members.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <MemberAvatar photo={m.profilePhoto} name={m.name} />
                      </td>
                      <td className="px-4 py-2.5 font-medium">{m.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.email}</td>
                      <td className="px-4 py-2.5">{m.planName ?? <span className="text-muted-foreground">None</span>}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusColors[m.membershipStatus] ?? "outline"} className="capitalize">
                            {m.membershipStatus}
                          </Badge>
                          {m.membershipStatus === "active" && m.endDate && (() => {
                            const days = getDaysRemaining(m.endDate);
                            if (days === null) return null;
                            if (days < 4) return <Badge variant="destructive" className="text-[10px] px-1 h-4">Expires {days}d</Badge>;
                            if (days < 8) return <Badge variant="secondary" className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1 h-4">{days}d left</Badge>;
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.endDate ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" asChild title="View details">
                            <Link to={`/members/${m.id}`}><Eye className="h-4 w-4" /></Link>
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openQrDialog(m)} title="Member QR & Portal">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                          </Button>
                          <Button
                            size="icon"
                            variant={m.membershipStatus !== "active" ? "default" : "ghost"}
                            onClick={() => openRenew(m)}
                            title="Renew membership"
                            className={m.membershipStatus !== "active" ? "h-8 w-8" : ""}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleCheckIn(m.id, m.name)} title="Check in">
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(m.id, m.name)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Renew Membership Dialog */}
      <Dialog open={!!renewTarget} onOpenChange={open => { if (!open) setRenewTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renew Membership</DialogTitle>
          </DialogHeader>
          {renewTarget && (
            <form onSubmit={handleRenew} className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <MemberAvatar photo={(members.find(m => m.id === renewTarget.id) as any)?.profilePhoto} name={renewTarget.name} />
                <div>
                  <p className="font-medium">{renewTarget.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{renewTarget.membershipStatus} membership</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={renewForm.planId} onValueChange={handleRenewPlanChange} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} — ₹{p.price} / {p.durationDays}d
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlan && (
                  <p className="text-xs text-muted-foreground">
                    Renews for {selectedPlan.durationDays} days from start date
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount Paid (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={renewForm.amount}
                    onChange={e => setRenewForm(f => ({ ...f, amount: e.target.value }))}
                    required
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Select value={renewForm.paymentMethod} onValueChange={v => setRenewForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={renewForm.startDate}
                  onChange={e => setRenewForm(f => ({ ...f, startDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Defaults to today if left unchanged</p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRenewTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={renewMember.isPending || !renewForm.planId || !renewForm.amount}>
                  {renewMember.isPending ? "Renewing..." : "Renew Membership"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <PhotoPicker value={form.profilePhoto} onChange={v => setForm(f => ({ ...f, profilePhoto: v }))} />
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Full Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Jane Doe" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="jane@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1-555-000" />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Membership Plan</Label>
                <Select value={form.planId} onValueChange={v => setForm(f => ({ ...f, planId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select a plan (optional)" /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name} — ₹{p.price}/{p.durationDays}d</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMember.isPending}>
                {createMember.isPending ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* QR & Portal Dialog */}
      <Dialog open={!!qrTarget} onOpenChange={open => { if (!open) setQrTarget(null); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Member QR & Portal</DialogTitle>
          </DialogHeader>
          {qrTarget && (
            <div className="flex flex-col items-center space-y-6 py-4">
              <div className="text-center">
                <h3 className="font-bold text-lg">{qrTarget.name}</h3>
                <p className="text-sm text-muted-foreground">ID: {qrTarget.id}</p>
              </div>

              {isLoadingQr ? (
                <div className="w-48 h-48 flex items-center justify-center border rounded-lg bg-muted/20">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-border">
                  <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Members can scan this QR at the kiosk to check in, or you can download it for them.
              </p>

              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={() => {
                  const a = document.createElement("a");
                  a.href = qrDataUrl;
                  a.download = `member-${qrTarget.id}-qr.png`;
                  a.click();
                }}>
                  <Download className="w-4 h-4 mr-2" /> Save QR
                </Button>
                {portalUrl && (
                  <Button variant="outline" className="flex-1" onClick={() => {
                    navigator.clipboard.writeText(portalUrl);
                    toast({ title: "Portal link copied to clipboard" });
                  }}>
                    <Copy className="w-4 h-4 mr-2" /> Copy Portal Link
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
