import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle2, Trash2, Edit } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function WorkoutPrograms() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ["/api/workout-programs"],
    queryFn: async () => {
      const res = await fetch("/api/workout-programs", {
        headers: { Authorization: `Bearer ${localStorage.getItem("gymflow_token")}` }
      });
      if (!res.ok) throw new Error("Failed to load programs");
      return res.json();
    },
  });

  const createProgram = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/workout-programs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("gymflow_token")}`
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-programs"] });
      toast({ title: "Program created successfully" });
      setIsCreating(false);
    },
  });

  const activateProgram = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/workout-programs/${id}/activate`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${localStorage.getItem("gymflow_token")}` }
      });
      if (!res.ok) throw new Error("Failed to activate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-programs"] });
      toast({ title: "Program activated" });
    },
  });

  const deleteProgram = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/workout-programs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("gymflow_token")}` }
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout-programs"] });
      toast({ title: "Program deleted" });
    },
  });

  function handleCreateDefault() {
    createProgram.mutate({
      name: "Standard PPL Split (Default)",
      description: "A classic 7-day push/pull/legs routine with 2 rest days.",
      useDefault: true,
    });
  }

  if (isLoading) return <div className="p-8">Loading programs...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workout Programs</h1>
          <p className="text-muted-foreground">Manage the workout plans offered to your members.</p>
        </div>
        {!isCreating && (
          <Button onClick={() => handleCreateDefault()}>
            <Plus className="mr-2 h-4 w-4" /> Add Default Program
          </Button>
        )}
      </div>

      {programs.length === 0 && !isCreating ? (
        <Card className="border-dashed border-2 bg-transparent text-center p-12">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-2">No Programs Yet</h2>
            <p className="text-muted-foreground mb-6">Create a workout program so members can see what to train when they check in.</p>
            <Button onClick={handleCreateDefault}>Generate Default PPL Program</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {programs.map((p: any) => (
            <Card key={p.id} className={p.isActive ? "border-primary shadow-sm" : ""}>
              <CardHeader className="flex flex-row items-start justify-between pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CardTitle>{p.name}</CardTitle>
                    {p.isActive && <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-0">Active</Badge>}
                  </div>
                  <CardDescription>{p.description || "No description provided."}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {!p.isActive && (
                    <Button variant="outline" size="sm" onClick={() => activateProgram.mutate(p.id)} disabled={activateProgram.isPending}>
                      Set Active
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("Are you sure?")) deleteProgram.mutate(p.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="schedule" className="border-0">
                    <AccordionTrigger className="bg-muted/50 px-4 rounded-md hover:no-underline font-medium text-sm">
                      View 7-Day Schedule
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {p.schedule.map((day: any, i: number) => (
                          <div key={i} className="rounded-lg border bg-card p-3">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                              Day {i + 1}
                            </div>
                            <div className="font-medium mb-2">{day.label}</div>
                            {day.isRest ? (
                              <div className="text-sm text-muted-foreground italic">Rest / Recovery</div>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {day.muscleGroups.map((mg: string) => (
                                    <span key={mg} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded capitalize">{mg}</span>
                                  ))}
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  {day.exercises.map((ex: any, j: number) => (
                                    <div key={j} className="flex justify-between items-center bg-muted/40 p-1.5 rounded">
                                      <span className="truncate pr-2">{ex.name}</span>
                                      <span className="text-muted-foreground whitespace-nowrap">{ex.sets} × {ex.reps}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
