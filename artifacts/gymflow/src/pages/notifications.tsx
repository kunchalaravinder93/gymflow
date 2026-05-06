import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, AlertTriangle, CreditCard, RefreshCw, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const typeIcons: Record<string, React.ReactNode> = {
  expiry_7days: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  expiry_3days: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  expired: <BellOff className="h-4 w-4 text-destructive" />,
  payment_received: <CreditCard className="h-4 w-4 text-green-500" />,
  renewal: <RefreshCw className="h-4 w-4 text-blue-500" />,
};

const typeColors: Record<string, string> = {
  expiry_7days: "text-amber-600",
  expiry_3days: "text-orange-600",
  expired: "text-destructive",
  payment_received: "text-green-600",
  renewal: "text-blue-600",
};

export default function Notifications() {
  const { data: notifications = [], isLoading } = useListNotifications({ unreadOnly: false });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  async function handleMarkRead(id: number) {
    try {
      await markRead.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    } catch {
      toast({ title: "Failed to mark as read", variant: "destructive" });
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead.mutateAsync();
      toast({ title: "All notifications marked as read" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    } catch {
      toast({ title: "Failed to mark all as read", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllRead} disabled={markAllRead.isPending}>
            <CheckCheck className="mr-2 h-4 w-4" /> Mark All Read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No notifications yet. Expiry alerts and payment confirmations will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => (
            <Card key={n.id} className={n.isRead ? "opacity-60" : "border-primary/30 shadow-sm"}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{typeIcons[n.type] ?? <Bell className="h-4 w-4 text-muted-foreground" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${!n.isRead ? typeColors[n.type] ?? "" : ""}`}>{n.title}</span>
                        {!n.isRead && <Badge className="text-xs px-1.5 py-0">New</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                  </div>
                  {!n.isRead && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => handleMarkRead(n.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
