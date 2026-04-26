const API_PREFIX = "/api/v1";
const TOKEN_STORAGE_KEY = "react-admin-access-token";

interface LoginResponse {
  access_token: string;
}

interface ApiErrorPayload {
  detail?: string;
  message?: string;
}

export interface BaleSalesCandidate {
  entry_id: string;
  source_type: string;
  source_label: string;
  bale_barcode: string;
  shipment_no: string;
  parcel_batch_no: string;
  source_bale_token: string;
  supplier_name: string;
  category_main: string;
  category_sub: string;
  weight_kg: number;
  package_count: number;
  entered_sales_pool_at: string | null;
  status: "available" | "sold" | "unavailable";
  raw_status: string;
  is_available: boolean;
  outbound_order_no: string;
  source_cost_kes: number;
  editable_cost_kes: number;
  downstream_cost_kes: number;
  total_cost_kes: number;
  margin_rate: number;
  target_sale_price_kes: number;
  pricing_note: string;
  pricing_updated_at: string | null;
  pricing_updated_by: string;
}

export interface BaleSalesOrderItem {
  entry_id: string;
  bale_barcode: string;
  shipment_no: string;
  supplier_name: string;
  category_main: string;
  category_sub: string;
  weight_kg: number;
  source_cost_kes: number;
  total_cost_kes: number;
  sale_price_kes: number;
  profit_kes: number;
}

export interface BaleSalesOrder {
  order_no: string;
  status: string;
  sold_by: string;
  customer_name: string;
  customer_contact: string;
  payment_method: string;
  note: string;
  created_by: string;
  created_at: string;
  completed_at: string;
  total_cost_kes: number;
  total_amount_kes: number;
  total_profit_kes: number;
  items: BaleSalesOrderItem[];
}

function readStoredToken() {
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.detail ?? payload.message ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function ensureAdminToken() {
  const existing = readStoredToken();
  if (existing) {
    return existing;
  }
  const response = await fetch(`${API_PREFIX}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin_1", password: "demo1234" }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const payload = (await response.json()) as LoginResponse;
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, payload.access_token);
  return payload.access_token;
}

async function apiFetch<T>(path: string, init?: RequestInit) {
  const token = await ensureAdminToken();
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  return (await response.json()) as T;
}

async function downloadApiFile(path: string) {
  const token = await ensureAdminToken();
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const blob = await response.blob();
  const contentDisposition = response.headers.get("Content-Disposition") ?? "";
  const match = contentDisposition.match(/filename=\"?([^"]+)\"?/i);
  const fileName = match?.[1] ?? "download.xlsx";
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function listBaleSalesCandidates(filters?: {
  shipmentNo?: string;
  status?: string;
  sourceType?: string;
}) {
  return apiFetch<BaleSalesCandidate[]>(
    `/bale-sales/candidates${buildQuery({
      shipment_no: filters?.shipmentNo,
      status: filters?.status,
      source_type: filters?.sourceType,
    })}`,
  );
}

export async function updateBaleSalesPricing(
  entryId: string,
  payload: {
    editable_cost_kes?: number;
    downstream_cost_kes?: number;
    margin_rate?: number;
    note?: string;
  },
) {
  return apiFetch<BaleSalesCandidate>(`/bale-sales/candidates/${encodeURIComponent(entryId)}/pricing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function downloadBaleSalesPricingSheet(filters?: {
  shipmentNo?: string;
  status?: string;
  sourceType?: string;
}) {
  return downloadApiFile(
    `/bale-sales/exports/pricing-sheet.xlsx${buildQuery({
      shipment_no: filters?.shipmentNo,
      status: filters?.status,
      source_type: filters?.sourceType,
    })}`,
  );
}

export async function createBaleSalesOrder(payload: {
  sold_by: string;
  customer_name: string;
  customer_contact: string;
  payment_method: string;
  note: string;
  items: Array<{ entry_id: string; sale_price_kes: number }>;
}) {
  return apiFetch<BaleSalesOrder>("/bale-sales/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function listBaleSalesOrders() {
  return apiFetch<BaleSalesOrder[]>("/bale-sales/orders");
}

export async function downloadBaleSalesOrderSheet(orderNo: string) {
  return downloadApiFile(`/bale-sales/orders/${encodeURIComponent(orderNo)}/sales-sheet.xlsx`);
}
