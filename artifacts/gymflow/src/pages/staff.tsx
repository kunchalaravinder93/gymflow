import { useState } from "react";
import { useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Pencil, Trash2, Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

const roleLabel: Record<string, string> = { admin: "Admin", staff: "Staff", trainer: "Trainer" };
const roleVariant: Record<string, any> = { admin: "default", staff: "secondary", trainer: "outline" };

export default function Staff() {
  const { data: staff = [], isLoading } = useListStaff();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "staff", isActive: true });

  function openCreate() { setEditId(null); setForm({ name: "", email: "", phone: "", password: "", role: "staff", isActive: true }); setOpen(true); }
  function openEdit(s: any) { setEditId(s.id); setForm({ name: s.name, email: s.email, phone: s.phone ?? "", password: "", role: s.role, isActive: s.isActive }); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editId) {
        const data: any = { name: form.name, phone: form.phone || undefined, role: form.role as any, isActive: form.isActive };
        await updateStaff.mutateAsync({ id: editId, data });
        toast({ title: "Staff member updated" });
      } else {
        await createStaff.mutateAsync({ data: { name: form.name, email: form.email, password: form.password, phone: form.phone || undefined, role: form.role as any } });
        toast({ title: "Staff member added" });
      }
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
    } catch {
      toast({ title: "Failed to save staff member", variant: "destructive" });
    }
  }

  async function handleDelete(id: number, name: string) {
    if (id === user?.id) { toast({ title: "Cannot delete your own account", variant: "destructive" }); return; }
    if (!confirm(`Remove ${name} from staff?`)) return;
    try {
      await deleteStaff.mutateAsync({ id });
      toast({ title: "Staff member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
    } catch {
      toast({ title: "Failed to remove staff", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
          <p className="text-muted-foreground">Manage gym staff accounts and roles.</p>
        </div>
        {user?.role === "admin" && (
          <Button onClick={openCreate}><UserPlus className="mr-2 h-4 w-4" /> Add Staff</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {staff.map(s => (
            <Card key={s.id}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {s.role === "admin" ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-sm text-muted-foreground">{s.email}</div>
                      {s.phone && <div className="text-sm text-muted-foreground">{s.phone}</div>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant={roleVariant[s.role] ?? "outline"}>{roleLabel[s.role] ?? s.role}</Badge>
                    {!s.isActive && <Badge variant="destructive">Inactive</Badge>}
                  </div>
                </div>
                {user?.role === "admin" && (
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(s)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {s.id !== user?.id && (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id, s.name)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            {!editId && (
              <>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="trainer">Trainer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editId && (
              <div className="flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                <Label>Active account</Label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createStaff.isPending || updateStaff.isPending}>
                {editId ? "Save" : "Add Staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
