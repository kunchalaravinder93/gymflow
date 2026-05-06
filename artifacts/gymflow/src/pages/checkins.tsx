import { useState, useEffect } from "react";
import { useListCheckins, useLookupMemberCheckin } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, Search, UserCheck, QrCode, ExternalLink, Calendar, Dumbbell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { QrScanner } from "@/components/qr-scanner";

export default function CheckIns() {
  const { data: checkins = [], isLoading } = useListCheckins({});
  const lookupCheckin = useLookupMemberCheckin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("qr");

  // Auto-clear result after 12 seconds
  useEffect(() => {
    if (lastResult) {
      const timer = setTimeout(() => setLastResult(null), 12000);
      return () => clearTimeout(timer);
    }
  }, [lastResult]);

  async function performCheckin(checkinQuery: string) {
    if (!checkinQuery.trim()) return;
    try {
      const result = await lookupCheckin.mutateAsync({ data: { query: checkinQuery.trim() } });
      setLastResult(result);
      toast({
        title: result.allowed ? "Check-in Successful" : "Access Denied",
        description: result.message,
        variant: result.allowed ? "default" : "destructive",
      });
      setQuery("");
      queryClient.invalidateQueries({ queryKey: ["/api/checkins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    } catch {
      toast({ title: "Member not found", variant: "destructive" });
      setLastResult(null);
    }
  }

  function handleManualCheckin(e: React.FormEvent) {
    e.preventDefault();
    performCheckin(query);
  }

  function handleQrScan(data: string) {
    performCheckin(data);
  }

  const todayISO = new Date().toISOString().split("T")[0];
  const todayCheckins = checkins.filter(c => c.checkedInAt.startsWith(todayISO));

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Check-In Kiosk</h1>
        <p className="text-muted-foreground">Scan member QR code or manually enter ID to check them in.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="qr"><QrCode className="w-4 h-4 mr-2" /> QR Scanner</TabsTrigger>
              <TabsTrigger value="manual"><UserCheck className="w-4 h-4 mr-2" /> Manual Entry</TabsTrigger>
            </TabsList>
            
            <TabsContent value="qr" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Scan Member QR</CardTitle>
                  <CardDescription>Hold the member's QR code up to the camera</CardDescription>
                </CardHeader>
                <CardContent>
                  <QrScanner onResult={handleQrScan} isActive={activeTab === "qr"} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manual" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Manual Check-In</CardTitle>
                  <CardDescription>Enter member ID or phone number</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleManualCheckin} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9 text-lg h-12" value={query} onChange={e => setQuery(e.target.value)} placeholder="Member ID or phone..." autoFocus={activeTab === "manual"} />
                    </div>
                    <Button type="submit" className="h-12 px-6" disabled={lookupCheckin.isPending || !query.trim()}>
                      {lookupCheckin.isPending ? "..." : "Check In"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* RESULT CARD */}
          {lastResult && (
            <Card className={`border-2 shadow-lg overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${lastResult.allowed ? "border-green-500" : "border-destructive"}`}>
              <div className={`px-4 py-3 flex items-center justify-between ${lastResult.allowed ? "bg-green-500 text-white" : "bg-destructive text-white"}`}>
                <div className="flex items-center gap-2 font-semibold">
                  {lastResult.allowed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  {lastResult.message}
                </div>
                <div className="text-sm font-medium opacity-90">Auto-clearing in 12s</div>
              </div>
              
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  {lastResult.member.profilePhoto ? (
                    <img src={lastResult.member.profilePhoto} alt={lastResult.member.name} className="w-16 h-16 rounded-full object-cover ring-2 ring-muted" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xl font-bold">
                      {lastResult.member.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold">{lastResult.member.name}</h3>
                    <p className="text-muted-foreground font-medium">{lastResult.member.planName ?? "No Active Plan"}</p>
                    {lastResult.memberToken && (
                      <Button variant="link" className="px-0 h-auto text-primary" onClick={() => window.open(`/member/${lastResult.memberToken}`, "_blank")}>
                        Open Member Portal <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Days Remaining Progress */}
                {lastResult.member.daysRemaining !== null && lastResult.member.daysRemaining !== undefined && (
                  <div className="mb-6 bg-muted/50 p-4 rounded-lg">
                    <div className="flex justify-between items-end mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        Membership Time Remaining
                      </div>
                      <div className={`text-xl font-bold ${lastResult.member.daysRemaining < 4 ? "text-destructive" : lastResult.member.daysRemaining < 8 ? "text-orange-500" : "text-green-600"}`}>
                        {lastResult.member.daysRemaining} days
                      </div>
                    </div>
                    <div className="h-2 w-full bg-muted-foreground/20 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${lastResult.member.daysRemaining < 4 ? "bg-destructive" : lastResult.member.daysRemaining < 8 ? "bg-orange-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(100, Math.max(0, (lastResult.member.daysRemaining / 30) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Today's Workout */}
                {lastResult.todayWorkout && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Dumbbell className="w-5 h-5 text-primary" />
                      <h4 className="font-semibold">Today's Workout: {lastResult.todayWorkout.todayPlan.label}</h4>
                    </div>
                    
                    {lastResult.todayWorkout.alreadyLoggedToday ? (
                      <div className="flex items-center gap-2 text-green-600 bg-green-100 dark:bg-green-900/30 px-3 py-2 rounded-md font-medium text-sm">
                        <CheckCircle2 className="w-4 h-4" /> Member already completed this workout today!
                      </div>
                    ) : lastResult.todayWorkout.todayPlan.isRest ? (
                      <p className="text-sm text-muted-foreground">Rest day. Have a great recovery!</p>
                    ) : (
                      <div>
                        <div className="flex gap-1.5 mb-3">
                          {lastResult.todayWorkout.todayPlan.muscleGroups.map((mg: string) => (
                            <Badge key={mg} variant="secondary" className="capitalize text-xs">{mg}</Badge>
                          ))}
                        </div>
                        <ul className="text-sm space-y-1">
                          {lastResult.todayWorkout.todayPlan.exercises.slice(0, 3).map((ex: any, i: number) => (
                            <li key={i} className="flex justify-between border-b border-border/50 pb-1 last:border-0">
                              <span>{ex.name}</span>
                              <span className="text-muted-foreground">{ex.sets}x{ex.reps}</span>
                            </li>
                          ))}
                          {lastResult.todayWorkout.todayPlan.exercises.length > 3 && (
                            <li className="text-muted-foreground text-xs italic pt-1">
                              + {lastResult.todayWorkout.todayPlan.exercises.length - 3} more exercises
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Today's Activity</CardTitle>
            <CardDescription>{todayCheckins.length} check-in{todayCheckins.length !== 1 ? "s" : ""} today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {todayCheckins.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No check-ins today yet</div>
              ) : todayCheckins.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium text-sm">{c.memberName ?? `Member #${c.memberId}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <Badge variant={c.status === "allowed" ? "default" : "destructive"}>
                    {c.status === "allowed" ? "Allowed" : "Denied"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
