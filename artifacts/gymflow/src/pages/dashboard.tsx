import { useGetDashboardStats, useGetUpcomingExpiries, useGetRevenueOverview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, AlertTriangle, Activity, DollarSign, CheckCircle2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: expiries, isLoading: expiriesLoading } = useGetUpcomingExpiries();
  const { data: revenue, isLoading: revenueLoading } = useGetRevenueOverview();

  if (statsLoading || expiriesLoading || revenueLoading) {
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{user?.gymName ?? "Dashboard"}</h1>
          <p className="text-muted-foreground">Welcome back, {user?.name} — here's your gym at a glance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Revenue (Month)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{stats?.monthRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total: ₹{stats?.totalRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Members</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.activeMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">out of {stats?.totalMembers} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-destructive">Expired/Expiring</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.expiredMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats?.expiringThisWeek} expiring this week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Today's Check-ins</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.todayCheckins}</div>
            <p className="text-xs text-muted-foreground mt-1">Since midnight</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Last 6 months revenue performance</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {revenue && revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenue}>
                  <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                  <Tooltip formatter={(value) => [`₹${value}`, "Revenue"]} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No revenue data yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Expiring in next 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {expiries && expiries.length > 0 ? expiries.map((alert) => (
                <div key={alert.memberId} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <div>
                    <div className="font-medium text-sm">{alert.memberName}</div>
                    <div className="text-xs text-muted-foreground">{alert.planName}</div>
                  </div>
                  {(() => {
                    const days = alert.daysUntilExpiry;
                    if (days <= 0) return <Badge variant="destructive">Expired</Badge>;
                    if (days < 4) return <Badge variant="destructive">{days} days left</Badge>;
                    return <Badge variant="secondary" className="bg-orange-500 hover:bg-orange-600 text-white">{days} days left</Badge>;
                  })()}
                </div>
              )) : (
                <div className="text-sm text-muted-foreground text-center py-4">No upcoming expiries</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}