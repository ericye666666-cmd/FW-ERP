import { CheckCircle2, Download, ScanLine, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StatCard } from "../components/stat-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import {
  type BaleSalesCandidate,
  type BaleSalesOrder,
  createBaleSalesOrder,
  downloadBaleSalesOrderSheet,
  listBaleSalesCandidates,
  listBaleSalesOrders,
} from "../lib/api";

const moneyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 2,
});

export function BaleSalesOutboundPage() {
  const [availableRows, setAvailableRows] = useState<BaleSalesCandidate[]>([]);
  const [orders, setOrders] = useState<BaleSalesOrder[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [salePriceDrafts, setSalePriceDrafts] = useState<Record<string, string>>({});
  const [scanValue, setScanValue] = useState("");
  const [soldBy, setSoldBy] = useState("Austin");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [latestOrder, setLatestOrder] = useState<BaleSalesOrder | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [candidates, orderRows] = await Promise.all([
        listBaleSalesCandidates({ status: "available" }),
        listBaleSalesOrders(),
      ]);
      setAvailableRows(candidates);
      setOrders(orderRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载真实出库页面失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setSalePriceDrafts((current) => {
      const next = { ...current };
      availableRows.forEach((row) => {
        if (!next[row.entry_id]) {
          const initialValue = row.target_sale_price_kes > 0 ? row.target_sale_price_kes : row.total_cost_kes;
          next[row.entry_id] = initialValue.toString();
        }
      });
      return next;
    });
  }, [availableRows]);

  const selectedRows = useMemo(
    () => selectedEntryIds
      .map((entryId) => availableRows.find((row) => row.entry_id === entryId))
      .filter((row): row is BaleSalesCandidate => Boolean(row)),
    [availableRows, selectedEntryIds],
  );

  const stats = useMemo(() => {
    const selectedTargetAmount = selectedRows.reduce(
      (sum, row) => sum + Number(salePriceDrafts[row.entry_id] || row.target_sale_price_kes || row.total_cost_kes || 0),
      0,
    );
    return [
      { label: "可扫 bale", value: String(availableRows.length), meta: "当前还没完成真实出库的销售池候选包" },
      { label: "已选出库", value: String(selectedRows.length), meta: "本次准备扫码核销并完成出库的 bale" },
      { label: "本次销售额", value: moneyFormatter.format(selectedTargetAmount), meta: "按当前选中行的销售价草稿汇总" },
      { label: "最近销售单", value: orders[0]?.order_no ?? "-", meta: "完成出库后可直接生成 Excel 销售单" },
    ];
  }, [availableRows.length, orders, salePriceDrafts, selectedRows]);

  const toggleSelection = (entryId: string) => {
    setSelectedEntryIds((current) =>
      current.includes(entryId) ? current.filter((value) => value !== entryId) : [...current, entryId],
    );
  };

  const addScannedBale = () => {
    const normalized = scanValue.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    const matched = availableRows.find((row) => row.bale_barcode.toUpperCase() === normalized);
    if (!matched) {
      setError(`找不到可售 bale：${normalized}`);
      return;
    }
    setError("");
    setSelectedEntryIds((current) => (current.includes(matched.entry_id) ? current : [...current, matched.entry_id]));
    setScanValue("");
  };

  const removeSelected = (entryId: string) => {
    setSelectedEntryIds((current) => current.filter((value) => value !== entryId));
  };

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      setError("请先填写客户名称。");
      return;
    }
    if (selectedRows.length === 0) {
      setError("请先选择或扫码至少一个 bale。");
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const order = await createBaleSalesOrder({
        sold_by: soldBy,
        customer_name: customerName.trim(),
        customer_contact: customerContact.trim(),
        payment_method: paymentMethod,
        note: note.trim(),
        items: selectedRows.map((row) => ({
          entry_id: row.entry_id,
          sale_price_kes: Number(salePriceDrafts[row.entry_id] || row.target_sale_price_kes || row.total_cost_kes || 0),
        })),
      });
      setLatestOrder(order);
      setSuccess(`已完成真实出库：${order.order_no}`);
      setSelectedEntryIds([]);
      setCustomerName("");
      setCustomerContact("");
      setNote("");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交真实出库失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOrderDownload = async (orderNo: string) => {
    setError("");
    try {
      await downloadBaleSalesOrderSheet(orderNo);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "下载销售单失败");
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.2rem] text-[#173238]">当前处理模块</CardTitle>
              <CardDescription>真实出库页。这里直接处理扫码核销、销售人、客户信息、付款方式和完成出库。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
              <p>局部目标是把销售 bale 从“待售”真正推进到“已出库已成交”，并且留下一张能回查的 Excel 销售单。</p>
              <p>这一步不再回头处理仓库工单，也不改原始 bale 去向判断。</p>
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.2rem] text-[#173238]">扫码核销</CardTitle>
              <CardDescription>支持直接贴枪扫 bale barcode。扫到后会把对应 bale 加进本次真实出库清单。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  placeholder="扫描或输入 bale barcode"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addScannedBale();
                    }
                  }}
                />
                <Button onClick={addScannedBale}>
                  <ScanLine className="h-4 w-4" />
                  加入
                </Button>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader className="border-b border-[#edf1ef] pb-5">
              <CardTitle className="text-[1.35rem] text-[#173238]">可售 bale 清单</CardTitle>
              <CardDescription className="mt-2 text-[15px] leading-6 text-slate-500">
                这些 bale 已经在销售池里，可通过勾选或扫码进入本次真实出库。
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-hidden rounded-[24px] border border-[#e7eeeb]">
                <div className="grid grid-cols-[56px_160px_170px_150px_120px_120px] gap-3 border-b border-[#e7eeeb] bg-[#f7faf9] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#688087]">
                  <p>选中</p>
                  <p>Bale</p>
                  <p>船单 / 来源</p>
                  <p>供应商 / 品类</p>
                  <p>成本</p>
                  <p>目标售价</p>
                </div>
                <div className="divide-y divide-[#edf1ef]">
                  {availableRows.map((row) => {
                    const checked = selectedEntryIds.includes(row.entry_id);
                    return (
                      <div
                        key={row.entry_id}
                        className="grid grid-cols-[56px_160px_170px_150px_120px_120px] gap-3 px-4 py-4 text-sm"
                      >
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelection(row.entry_id)}
                            className="h-4 w-4 accent-[#153d43]"
                          />
                        </div>
                        <div>
                          <p className="font-semibold text-[#173238]">{row.bale_barcode}</p>
                          <p className="mt-2 text-xs text-slate-500">{row.source_label}</p>
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
                        <p className="font-semibold text-[#173238]">{moneyFormatter.format(row.total_cost_kes)}</p>
                        <p className="font-semibold text-[#173238]">{moneyFormatter.format(row.target_sale_price_kes)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!loading && availableRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">当前没有可真实出库的销售池 bale。</div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.2rem] text-[#173238]">出库登记</CardTitle>
              <CardDescription>标记销售人、客户、联系方式和付款方式，然后一次性完成真实出库。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input value={soldBy} onChange={(event) => setSoldBy(event.target.value)} placeholder="销售人" />
              <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="客户名称" />
              <Input
                value={customerContact}
                onChange={(event) => setCustomerContact(event.target.value)}
                placeholder="客户联系方式"
              />
              <Select
                options={[
                  { label: "Bank transfer", value: "bank_transfer" },
                  { label: "Cash", value: "cash" },
                  { label: "M-Pesa", value: "mpesa" },
                ]}
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              />
              <textarea
                className="min-h-[96px] w-full rounded-2xl border border-[color:var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[color:var(--app-text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="备注，例如客户要求、提货方式、尾款说明"
              />
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader className="border-b border-[#edf1ef] pb-5">
              <CardTitle className="text-[1.35rem] text-[#173238]">本次出库明细</CardTitle>
              <CardDescription className="mt-2 text-[15px] leading-6 text-slate-500">
                可直接改最终销售价。完成后，系统会把这些 bale 标记为已出库、已销售。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {selectedRows.map((row) => (
                <div key={row.entry_id} className="rounded-[24px] border border-[#e7eeeb] bg-[#fbfcfb] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#173238]">{row.bale_barcode}</p>
                      <p className="mt-1 text-sm text-slate-500">{row.shipment_no || row.source_bale_token || "-"}</p>
                      <p className="mt-2 text-xs text-slate-500">{[row.supplier_name, row.category_main, row.category_sub].filter(Boolean).join(" / ")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSelected(row.entry_id)}
                      className="rounded-full bg-[#eef4f2] p-2 text-[#31545c]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">总成本</p>
                      <p className="mt-2 text-base font-semibold text-[#173238]">{moneyFormatter.format(row.total_cost_kes)}</p>
                    </div>
                    <div className="rounded-[18px] bg-white px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">销售价</p>
                      <Input
                        type="number"
                        step="0.01"
                        value={salePriceDrafts[row.entry_id] ?? ""}
                        onChange={(event) =>
                          setSalePriceDrafts((current) => ({
                            ...current,
                            [row.entry_id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button onClick={() => void handleSubmit()} disabled={submitting || selectedRows.length === 0}>
                <CheckCircle2 className="h-4 w-4" />
                完成真实出库
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#dde5e2] bg-[#153d43] text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white/68">最新完成</p>
                  <h3 className="mt-2 text-[1.8rem] font-semibold">{latestOrder?.order_no ?? orders[0]?.order_no ?? "暂无"}</h3>
                </div>
                {latestOrder ? (
                  <Button
                    variant="outline"
                    className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => void handleOrderDownload(latestOrder.order_no)}
                  >
                    <Download className="h-4 w-4" />
                    下载销售单
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.15rem] text-[#173238]">最近销售单</CardTitle>
              <CardDescription>真实出库完成后，这里保留最近的 Bale 销售单，支持再次导出 Excel。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.slice(0, 6).map((order) => (
                <div key={order.order_no} className="rounded-[22px] border border-[#e7eeeb] bg-[#fbfcfb] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#173238]">{order.order_no}</p>
                      <p className="mt-1 text-sm text-slate-500">{order.customer_name}</p>
                    </div>
                    <Badge variant="success">{moneyFormatter.format(order.total_amount_kes)}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="outline" size="sm" onClick={() => void handleOrderDownload(order.order_no)}>
                      <Download className="h-4 w-4" />
                      下载 Excel
                    </Button>
                    <Badge variant="info">{order.payment_method}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
