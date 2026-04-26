import { Download, RefreshCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StatCard } from "../components/stat-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import {
  type BaleSalesCandidate,
  downloadBaleSalesPricingSheet,
  listBaleSalesCandidates,
  updateBaleSalesPricing,
} from "../lib/api";

interface PricingDraft {
  editableCostKes: string;
  downstreamCostKes: string;
  marginPercent: string;
}

const moneyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 2,
});

export function BaleSalesPricingPage() {
  const [rows, setRows] = useState<BaleSalesCandidate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PricingDraft>>({});
  const [shipmentFilter, setShipmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("available");
  const [loading, setLoading] = useState(true);
  const [savingEntryId, setSavingEntryId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listBaleSalesCandidates({
        shipmentNo: shipmentFilter || undefined,
        status: statusFilter || undefined,
      });
      setRows(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载待售包裹失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, [shipmentFilter, statusFilter]);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        if (!next[row.entry_id]) {
          next[row.entry_id] = {
            editableCostKes: row.editable_cost_kes.toString(),
            downstreamCostKes: row.downstream_cost_kes.toString(),
            marginPercent: (row.margin_rate * 100).toFixed(2),
          };
        }
      });
      return next;
    });
  }, [rows]);

  const shipmentOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => row.shipment_no).filter(Boolean)));
    return [{ label: "全部船单", value: "" }, ...values.map((value) => ({ label: value, value }))];
  }, [rows]);

  const stats = useMemo(() => {
    const totalSourceCost = rows.reduce((sum, row) => sum + row.source_cost_kes, 0);
    const totalTargetSales = rows.reduce((sum, row) => sum + row.target_sale_price_kes, 0);
    const availableCount = rows.filter((row) => row.status === "available").length;
    return [
      { label: "待售 bale", value: String(rows.length), meta: "当前筛选结果里的销售池候选包" },
      { label: "可售数量", value: String(availableCount), meta: "已经进入销售池且还没完成出库" },
      { label: "源成本", value: moneyFormatter.format(totalSourceCost), meta: "来自船单录入与后续成本池的当前合计" },
      { label: "目标销售额", value: moneyFormatter.format(totalTargetSales), meta: "按当前毛利率推出来的销售目标" },
    ];
  }, [rows]);

  const handleDraftChange = (entryId: string, field: keyof PricingDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [entryId]: {
        ...(current[entryId] ?? {
          editableCostKes: "0",
          downstreamCostKes: "0",
          marginPercent: "0",
        }),
        [field]: value,
      },
    }));
  };

  const handleSave = async (entryId: string) => {
    const draft = drafts[entryId];
    if (!draft) {
      return;
    }
    setSavingEntryId(entryId);
    setError("");
    setSuccess("");
    try {
      const updated = await updateBaleSalesPricing(entryId, {
        editable_cost_kes: Number(draft.editableCostKes || "0"),
        downstream_cost_kes: Number(draft.downstreamCostKes || "0"),
        margin_rate: Number(draft.marginPercent || "0") / 100,
      });
      setRows((current) => current.map((row) => (row.entry_id === updated.entry_id ? updated : row)));
      setDrafts((current) => ({
        ...current,
        [entryId]: {
          editableCostKes: updated.editable_cost_kes.toString(),
          downstreamCostKes: updated.downstream_cost_kes.toString(),
          marginPercent: (updated.margin_rate * 100).toFixed(2),
        },
      }));
      setSuccess(`已保存 ${updated.bale_barcode} 的成本与毛利。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存定价失败");
    } finally {
      setSavingEntryId("");
    }
  };

  const handleDownload = async () => {
    setError("");
    setSuccess("");
    try {
      await downloadBaleSalesPricingSheet({
        shipmentNo: shipmentFilter || undefined,
        status: statusFilter || undefined,
      });
      setSuccess("已生成待售包裹成本表 Excel。");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "导出成本表失败");
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-6">
          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.2rem] text-[#173238]">当前处理模块</CardTitle>
              <CardDescription>待售包裹成本与毛利编辑。这里不做真实出库，只先把销售池里的候选 bale 和定价表理顺。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>局部目标是把船单录入后的成本池，接成一张能直接编辑成本与毛利的销售表。</p>
              <p>这一步只做两件事：一是稳定候选 bale 成本口径，二是生成可下载的 Excel 成本编辑表。</p>
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.2rem] text-[#173238]">筛选与导出</CardTitle>
              <CardDescription>按船单收窄视角，先把某一批待售 bale 的成本价和目标毛利校正好。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select options={shipmentOptions} value={shipmentFilter} onChange={(event) => setShipmentFilter(event.target.value)} />
              <Select
                options={[
                  { label: "可售", value: "available" },
                  { label: "全部状态", value: "" },
                  { label: "已售", value: "sold" },
                  { label: "不可售", value: "unavailable" },
                ]}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void loadRows()} variant="outline">
                  <RefreshCcw className="h-4 w-4" />
                  刷新
                </Button>
                <Button onClick={() => void handleDownload()}>
                  <Download className="h-4 w-4" />
                  导出成本表 Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#dde5e2] bg-[#153d43] text-white">
            <CardContent className="p-6">
              <p className="text-sm text-white/68">成本口径</p>
              <h3 className="mt-2 text-[1.8rem] font-semibold">先锁源成本，再补销售阶段成本</h3>
              <p className="mt-4 text-sm leading-6 text-white/72">
                `source_cost_kes` 来自船单录入与后续成本池；`editable_cost_kes` 和 `downstream_cost_kes`
                允许在销售环节做最后一层修正。
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#dde5e2] bg-white/92">
          <CardHeader className="border-b border-[#edf1ef] pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[1.35rem] text-[#173238]">待售 bale 成本编辑表</CardTitle>
                <CardDescription className="mt-2 text-[15px] leading-6 text-slate-500">
                  每一行都对应一个已经进入销售池的 bale。你可以直接改成本、补销售阶段成本，然后按毛利率推销售价。
                </CardDescription>
              </div>
              {loading ? <Badge variant="warning">加载中</Badge> : <Badge variant="info">{rows.length} 行</Badge>}
            </div>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            {success ? <p className="mt-3 text-sm text-emerald-600">{success}</p> : null}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <div className="min-w-[1160px]">
                <div className="grid grid-cols-[160px_150px_150px_120px_120px_120px_120px_120px_120px_100px] gap-3 border-b border-[#e7eeeb] bg-[#f7faf9] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#688087]">
                  <p>Bale</p>
                  <p>船单 / 来源</p>
                  <p>供应商 / 品类</p>
                  <p>重量 KG</p>
                  <p>源成本</p>
                  <p>编辑成本</p>
                  <p>后续成本</p>
                  <p>毛利 %</p>
                  <p>目标售价</p>
                  <p>操作</p>
                </div>

                <div className="divide-y divide-[#edf1ef]">
                  {rows.map((row) => {
                    const draft = drafts[row.entry_id] ?? {
                      editableCostKes: row.editable_cost_kes.toString(),
                      downstreamCostKes: row.downstream_cost_kes.toString(),
                      marginPercent: (row.margin_rate * 100).toFixed(2),
                    };
                    return (
                      <div
                        key={row.entry_id}
                        className="grid grid-cols-[160px_150px_150px_120px_120px_120px_120px_120px_120px_100px] gap-3 px-4 py-4 text-sm"
                      >
                        <div>
                          <p className="font-semibold text-[#173238]">{row.bale_barcode}</p>
                          <p className="mt-2 text-xs text-slate-500">{row.source_label}</p>
                          <Badge variant={row.status === "available" ? "success" : row.status === "sold" ? "info" : "warning"}>
                            {row.status === "available" ? "可售" : row.status === "sold" ? "已售" : "不可售"}
                          </Badge>
                        </div>
                        <div>
                          <p className="font-medium text-[#173238]">{row.shipment_no || "-"}</p>
                          <p className="mt-2 text-xs text-slate-500">{row.parcel_batch_no || row.source_bale_token || "-"}</p>
                        </div>
                        <div>
                          <p className="font-medium text-[#173238]">{row.supplier_name || "-"}</p>
                          <p className="mt-2 text-xs text-slate-500">
                            {[row.category_main, row.category_sub].filter(Boolean).join(" / ") || "-"}
                          </p>
                        </div>
                        <p className="font-semibold text-[#173238]">{row.weight_kg.toFixed(2)}</p>
                        <p className="font-semibold text-[#173238]">{moneyFormatter.format(row.source_cost_kes)}</p>
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.editableCostKes}
                          onChange={(event) => handleDraftChange(row.entry_id, "editableCostKes", event.target.value)}
                          disabled={!row.is_available}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.downstreamCostKes}
                          onChange={(event) => handleDraftChange(row.entry_id, "downstreamCostKes", event.target.value)}
                          disabled={!row.is_available}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.marginPercent}
                          onChange={(event) => handleDraftChange(row.entry_id, "marginPercent", event.target.value)}
                          disabled={!row.is_available}
                        />
                        <div>
                          <p className="font-semibold text-[#173238]">{moneyFormatter.format(row.target_sale_price_kes)}</p>
                          <p className="mt-2 text-xs text-slate-500">总成本 {moneyFormatter.format(row.total_cost_kes)}</p>
                        </div>
                        <div className="flex items-start justify-end">
                          <Button
                            size="sm"
                            onClick={() => void handleSave(row.entry_id)}
                            disabled={!row.is_available || savingEntryId === row.entry_id}
                          >
                            <Save className="h-4 w-4" />
                            保存
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {!loading && rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">当前筛选下没有进入销售池的 bale。</div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
