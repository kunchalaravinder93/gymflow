import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, Clock, Calendar as CalendarIcon, User, Dumbbell, Activity, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MemberPortal() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/member-portal", token],
    queryFn: async () => {
      const res = await fetch(`/api/member-portal/${token}`);
      if (!res.ok) throw new Error("Invalid or expired link");
      return res.json();
    },
  });

  const logWorkout = useMutation({
    mutationFn: async (workoutData: any) => {
      const res = await fetch(`/api/member-portal/${token}/log-workout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workoutData),
      });
      if (!res.ok) throw new Error("Failed to log workout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/member-portal", token] });
      toast({ title: "Workout logged successfully!", variant: "default" });
    },
    onError: () => {
      toast({ title: "Failed to log workout", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold mb-2">Link Expired or Invalid</h2>
            <p className="text-muted-foreground mb-6">This member portal link is no longer active. Please scan your QR code at the gym to get a fresh link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { member, gym, recommendation, history } = data;
  const isExpired = member.membershipStatus !== "active";

  function handleLogToday() {
    if (!recommendation?.todayPlan) return;
    logWorkout.mutate({
      muscleGroups: recommendation.todayPlan.muscleGroups,
      exercises: recommendation.todayPlan.exercises,
      notes: "Logged via member portal",
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Header Banner */}
      <div className="bg-primary px-4 pt-12 pb-24 rounded-b-[2.5rem] shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent"></div>
        <div className="relative z-10 flex flex-col items-center text-center">
          {member.profilePhoto ? (
            <img src={member.profilePhoto} alt={member.name} className="w-24 h-24 rounded-full border-4 border-white/20 object-cover shadow-lg" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-white/20 border-4 border-white/20 flex items-center justify-center text-white shadow-lg">
              <User className="w-10 h-10" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white mt-4">{member.name}</h1>
          <p className="text-primary-foreground/80 font-medium">{gym.name}</p>
        </div>
      </div>

      <div className="px-4 -mt-16 space-y-4 max-w-md mx-auto relative z-20">
        {/* Membership Status Card */}
        <Card className="shadow-md border-0 ring-1 ring-black/5 dark:ring-white/10">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Current Plan</p>
              <div className="font-semibold text-lg">{member.planName ?? "No Plan"}</div>
              <Badge variant={isExpired ? "destructive" : "default"} className="mt-2">
                {member.membershipStatus.toUpperCase()}
              </Badge>
            </div>
            
            <div className="text-right flex flex-col items-end">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="none" className="text-muted/30" />
                  <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="none"
                    className={isExpired ? "text-destructive" : member.daysRemaining < 4 ? "text-orange-500" : "text-green-500"}
                    strokeDasharray="175"
                    strokeDashoffset={member.daysRemaining ? Math.max(0, 175 - (175 * Math.min(member.daysRemaining, 30) / 30)) : 175}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold leading-none">{isExpired ? 0 : member.daysRemaining}</span>
                  <span className="text-[10px] text-muted-foreground uppercase mt-0.5">days</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Workout */}
        {recommendation && (
          <Card className="shadow-md border-0 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
            <div className="bg-muted px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Today's Plan</h3>
              </div>
              <Badge variant="outline">{recommendation.todayPlan.label}</Badge>
            </div>
            <CardContent className="p-0">
              {recommendation.alreadyLoggedToday ? (
                <div className="p-8 text-center flex flex-col items-center justify-center bg-green-50 dark:bg-green-950/20">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
                  <h4 className="font-bold text-lg text-green-700 dark:text-green-400">Workout Complete!</h4>
                  <p className="text-sm text-green-600/80 dark:text-green-500/80 mt-1">Awesome job crushing it today.</p>
                </div>
              ) : recommendation.todayPlan.isRest ? (
                <div className="p-8 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-3">
                    <Clock className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-lg">Rest Day</h4>
                  <p className="text-sm text-muted-foreground mt-1">Take it easy and recover for tomorrow.</p>
                  <Button onClick={handleLogToday} disabled={logWorkout.isPending} className="mt-4 w-full" variant="outline">
                    Mark as Rested
                  </Button>
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {recommendation.todayPlan.muscleGroups.map((mg: string) => (
                      <span key={mg} className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-md capitalize">
                        {mg}
                      </span>
                    ))}
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    {recommendation.todayPlan.exercises.map((ex: any, i: number) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="font-medium">{ex.name}</span>
                        <div className="text-sm bg-muted px-2 py-1 rounded">
                          {ex.sets} sets <span className="text-muted-foreground mx-1">×</span> {ex.reps}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button onClick={handleLogToday} disabled={logWorkout.isPending} className="w-full h-12 text-base shadow-sm">
                    {logWorkout.isPending ? "Logging..." : "Mark Workout Complete"} <Check className="ml-2 w-5 h-5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Weekly Schedule */}
        {recommendation?.weeklyPlan && (
          <Card className="shadow-md border-0 ring-1 ring-black/5 dark:ring-white/10">
            <CardHeader className="pb-3 border-b bg-muted/50">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" /> Weekly Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Accordion type="single" collapsible className="w-full">
                {recommendation.weeklyPlan.map((day: any, i: number) => (
                  <AccordionItem value={`day-${i}`} key={i} className="border-b last:border-0 px-4">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${day.isToday ? "bg-primary" : day.wasCompleted ? "bg-green-500" : "bg-muted"}`} />
                        <span className={`font-medium ${day.isToday ? "text-primary" : ""}`}>{day.dayName}</span>
                        <span className="text-xs text-muted-foreground ml-auto pr-2">{day.label}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1 pb-4 text-sm text-muted-foreground">
                      {day.isRest ? (
                        "Rest and recover."
                      ) : (
                        <ul className="list-disc pl-5 space-y-1">
                          {day.exercises.map((ex: any, j: number) => (
                            <li key={j}>{ex.name} ({ex.sets}x{ex.reps})</li>
                          ))}
                        </ul>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}

// Simple fallback icon
function XCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
