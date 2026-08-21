import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { listMySectionStudents, assignClassLeader } from "@/lib/class-roles.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/assign-cr")({
  component: AssignCrPage,
});

function AssignCrPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMySectionStudents);
  const assignFn = useServerFn(assignClassLeader);

  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["sectionRoster"],
    queryFn: () => listFn(),
  });

  const assignMut = useMutation({
    mutationFn: (studentId: string) => assignFn({ data: { studentId } }),
    onSuccess: () => {
      toast.success("Class Leader assigned. They now see the Class Management module.");
      qc.invalidateQueries({ queryKey: ["sectionRoster"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to assign"),
  });

  const currentCr = roster.find((s) => s.role === "class_leader");

  return (
    <ChatLayout activeThreadId={null}>
      <div className="h-full overflow-y-auto bg-gradient-to-b from-muted/40 via-background to-background">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="px-6 py-5 border-b border-border"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl border border-border bg-card flex items-center justify-center">
              <Crown className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <h1 className="text-base font-display font-black tracking-tight text-foreground">Assign Class Leader</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {currentCr ? `Currently: ${currentCr.full_name || currentCr.email}` : "No Class Leader assigned yet"}
              </p>
            </div>
          </div>
        </motion.div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            </div>
          ) : roster.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-20">
              No students yet — add some from the Dashboard first.
            </p>
          ) : (
            <motion.div
              initial="hidden" animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <AnimatePresence>
                {roster.filter((s) => !s.removed_at).map((s) => {
                  const isCr = s.role === "class_leader";
                  return (
                    <motion.div key={s.id} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} whileHover={{ y: -2 }}>
                      <Card className={isCr ? "border-brand-gold/50" : ""}>
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-9 w-9 rounded-xl bg-muted border border-border grid place-items-center text-xs font-bold text-foreground shrink-0">
                              {(s.full_name || s.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">{s.full_name || "—"}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                            </div>
                          </div>
                          {isCr ? (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
                              <Crown className="h-3 w-3" /> Class Leader
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={assignMut.isPending}
                              onClick={() => assignMut.mutate(s.id)}
                              className="shrink-0 gap-1"
                            >
                              <Crown className="h-3 w-3" /> Make CR
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>
    </ChatLayout>
  );
}
