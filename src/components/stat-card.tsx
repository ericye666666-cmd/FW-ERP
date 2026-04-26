import { ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "./ui/card";

interface StatCardProps {
  label: string;
  value: string;
  meta: string;
}

export function StatCard({ label, value, meta }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-[color:var(--border-soft)] bg-[var(--surface-soft)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--eyebrow-text)]">{label}</p>
            <ArrowUpRight className="h-4 w-4 text-[color:var(--muted)]" />
          </div>
        </div>
        <div className="px-5 py-5">
          <div className="text-[2rem] font-semibold tracking-tight text-[color:var(--app-text)]">{value}</div>
          <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{meta}</p>
        </div>
      </CardContent>
    </Card>
  );
}
