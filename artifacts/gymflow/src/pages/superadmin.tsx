import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Users, DollarSign, Activity, RefreshCw, Eye, Pencil, Power } from "lucide-react";

const BASE = "/api/superadmin";

type SaasSub = {
  id: number;
  plan: string;
  status: string;
  amount: string | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
};

type GymRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  totalMembers: number;
  activeMembers: number;
  staffCount: number;
  saasSubscription: SaasSub | null;
  totalPaid: number;
};

type Stats = {
  totalGyms: number;
  activeGyms: number;
  totalMembers: number;
  activeMembers: number;
  totalRevenue: number;
  activeSubs: number;
  trialSubs: number;
};

const PLAN_COLORS: Record<string, string> = {
  trial: "secondary",
  starter: "outline",
  growth: "default",
  pro: "destructive",
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  trial: "secondary",
  expired: "destructive",
  cancelled: "outline",
};

export default function SuperAdmin() {
  const [secret, setSecret] = useState(() => localStorage.getItem("gymflow_superadmin_secret") || "");
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [gyms, setGyms] = useState<GymRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editGym, setEditGym] = useState<GymRow | null>(null);
  const [editPlan, setEditPlan] = useState("trial");
  const [editStatus, setEditStatus] = useState("trial");
  const [editAmount, setEditAmount] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchAll(s: string) {
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${s}` };
      const [statsRes, gymsRes] = await Promise.all([
        fetch(`${BASE}/stats`, { headers }),
        fetch(`${BASE}/gyms`, { headers }),
      ]);
      if (!statsRes.ok || !gymsRes.ok) throw new Error("Invalid secret or server error");
      setStats(await statsRes.json());
      setGyms(await gymsRes.json());
      setAuthed(true);
      localStorage.setItem("gymflow_superadmin_secret", s);
    } catch {
      setError("Access denied. Check your superadmin secret.");
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(gym: GymRow) {
    setEditGym(gym);
    setEditPlan(gym.saasSubscription?.plan ?? "trial");
    setEditStatus(gym.saasSubscription?.status ?? "trial");
    setEditAmount(gym.saasSubscription?.amount ?? "");
    setEditEndDate(gym.saasSubscription?.endDate ?? "");
    setEditNotes(gym.saasSubscription?.notes ?? "");
  }

  async function saveSubscription() {
    if (!editGym) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/gyms/${editGym.id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          plan: editPlan,
          status: editStatus,
          amount: editAmount ? Number(editAmount) : null,
          endDate: editEndDate || null,
          notes: editNotes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await fetchAll(secret);
      setEditGym(null);
    } catch {
      alert("Failed to save subscription");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(gym: GymRow) {
    await fetch(`${BASE}/gyms/${gym.id}/toggle-active`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${secret}` },
    });
    await fetchAll(secret);
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">SA</div>
            <CardTitle className="text-2xl">GymFlow Owner Portal</CardTitle>
            <CardDescription>Enter your superadmin secret to access the platform dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Superadmin Secret</Label>
              <Input
                type="password"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchAll(secret)}
                placeholder="Enter secret key"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={loading || !secret} onClick={() => fetchAll(secret)}>
              {loading ? "Checking..." : "Access Portal"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">GymFlow Owner Portal</h1>
          <p className="text-muted-foreground">Platform-wide SaaS management dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchAll(secret)}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setAuthed(false); localStorage.removeItem("gymflow_superadmin_secret"); }}>
            Sign Out
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalGyms}</div>
                  <p className="text-xs text-muted-foreground">Total Gyms</p>
                  <p className="text-xs text-green-600">{stats.activeGyms} active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.totalMembers}</div>
                  <p className="text-xs text-muted-foreground">Total Members</p>
                  <p className="text-xs text-green-600">{stats.activeMembers} active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">₹{stats.totalRevenue.toFixed(0)}</div>
                  <p className="text-xs text-muted-foreground">Platform Revenue</p>
                  <p className="text-xs text-muted-foreground">All gyms paid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.activeSubs}</div>
                  <p className="text-xs text-muted-foreground">Paid Subscriptions</p>
                  <p className="text-xs text-yellow-600">{stats.trialSubs} on trial</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Registered Gyms</CardTitle>
          <CardDescription>Manage subscriptions, view member counts, and control gym access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-4">Gym</th>
                  <th className="text-left py-2 pr-4">Members</th>
                  <th className="text-left py-2 pr-4">SaaS Plan</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-left py-2 pr-4">Total Paid</th>
                  <th className="text-left py-2 pr-4">Renews / Ends</th>
                  <th className="text-left py-2 pr-4">Registered</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {gyms.map(gym => (
                  <tr key={gym.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{gym.name}</div>
                      <div className="text-xs text-muted-foreground">{gym.email}</div>
                      {!gym.isActive && <Badge variant="destructive" className="text-[10px] mt-1">Disabled</Badge>}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{gym.totalMembers}</div>
                      <div className="text-xs text-green-600">{gym.activeMembers} active</div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={(PLAN_COLORS[gym.saasSubscription?.plan ?? "trial"] ?? "secondary") as "default" | "secondary" | "destructive" | "outline"}>
                        {gym.saasSubscription?.plan ?? "trial"}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={STATUS_COLORS[gym.saasSubscription?.status ?? "trial"] ?? "secondary"}>
                        {gym.saasSubscription?.status ?? "trial"}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium">₹{gym.totalPaid.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-muted-foreground text-xs">
                      {gym.saasSubscription?.endDate ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground text-xs">
                      {new Date(gym.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(gym)} title="Edit subscription">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleActive(gym)}
                          title={gym.isActive ? "Disable gym" : "Enable gym"}
                          className={gym.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-700"}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {gyms.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No gyms registered yet</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editGym} onOpenChange={open => !open && setEditGym(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit SaaS Subscription — {editGym?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Plan</Label>
                <Select value={editPlan} onValueChange={setEditPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Amount Paid ($)</Label>
                <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Renewal / End Date</Label>
                <Input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGym(null)}>Cancel</Button>
            <Button onClick={saveSubscription} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
