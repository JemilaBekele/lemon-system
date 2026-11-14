// Sales history in the layout of Peachtree (Sage 50) "Sales Journal" import:
// one row per distribution line, with the invoice header repeated on every
// row of that invoice.
//
// Signs follow Peachtree's own Sales Journal export: the Accounts Receivable
// amount is positive (debit); item and VAT lines are negative (credits, and
// the item quantity is negative too); a discount line is positive (debit).
// Per invoice the lines and the A/R amount therefore add up to zero.
//
// In Peachtree: File > Select Import/Export > Accounts Receivable > Sales
// Journal > Import, tick "First Row Contains Headings" and set the Layout to
// exactly these fields in this order.

import { ISell, SaleStatus } from "@/models/Sell";

export const PEACHTREE_SALES_HEADERS = [
  "Customer ID",
  "Invoice/CM #",
  "Date",
  "Date Due",
  "Accounts Receivable Account",
  "Accounts Receivable Amount",
  "Number of Distributions",
  "Invoice/CM Distribution",
  "Quantity",
  "Item ID",
  "Description",
  "G/L Account",
  "Unit Price",
  "Amount",
] as const;

// G/L account columns are left empty: the accountant fills them in Excel
// before importing.
export type TPeachtreeSettings = {
  // One customer ID for every sale (e.g. CASH), else one per customer
  singleCustomer: boolean;
  customerId: string;
  includeItemId: boolean; // Item ID = product / sub-product code
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY";
};

export const DEFAULT_PEACHTREE_SETTINGS: TPeachtreeSettings = {
  singleCustomer: true,
  customerId: "CASH",
  includeItemId: true,
  dateFormat: "MM/DD/YYYY",
};

// Sales that are not (or no longer) real sales are left out
export const EXCLUDED_STATUSES: string[] = [
  SaleStatus.CANCELLED,
  SaleStatus.NOT_APPROVED,
];

type TRow = (string | number)[];

// Peachtree limits: IDs 20 characters, descriptions 160
const MAX_ID = 20;
const MAX_DESCRIPTION = 160;

const toNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// Plain number with 2 decimals, no thousands separator
const amount = (value: number) => round2(value).toFixed(2);

const formatDate = (
  iso: string,
  dateFormat: TPeachtreeSettings["dateFormat"],
) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return dateFormat === "MM/DD/YYYY"
    ? `${mm}/${dd}/${yyyy}`
    : `${dd}/${mm}/${yyyy}`;
};

// Peachtree IDs: no leading/trailing spaces, at most 20 characters
const toId = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, MAX_ID);

export const peachtreeCustomerId = (
  sell: ISell,
  settings: TPeachtreeSettings,
) => {
  if (settings.singleCustomer || !sell.customer)
    return toId(settings.customerId);
  const customer = sell.customer as { name?: string; companyName?: string };
  return toId(customer.companyName || customer.name || settings.customerId);
};

export type TPeachtreeResult = {
  rows: TRow[]; // without the header row
  invoices: number;
  skipped: { invoiceNo: string; reason: string }[];
  total: number; // sum of A/R amounts
};

export const buildPeachtreeSalesRows = (
  sells: ISell[],
  settings: TPeachtreeSettings,
): TPeachtreeResult => {
  const rows: TRow[] = [];
  const skipped: TPeachtreeResult["skipped"] = [];
  let invoices = 0;
  let total = 0;

  // Oldest first, as they would be entered in the journal
  const ordered = [...sells].sort(
    (a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime(),
  );

  ordered.forEach((sell) => {
    if (EXCLUDED_STATUSES.includes(sell.saleStatus)) {
      skipped.push({
        invoiceNo: sell.invoiceNo,
        reason:
          sell.saleStatus === SaleStatus.CANCELLED
            ? "cancelled"
            : "not approved",
      });
      return;
    }
    const items = sell.items || [];
    if (items.length === 0) {
      skipped.push({ invoiceNo: sell.invoiceNo, reason: "no items" });
      return;
    }

    type TLine = {
      quantity: string;
      itemId: string;
      description: string;
      account: string;
      unitPrice: string;
      amount: number;
    };
    const lines: TLine[] = items.map((item) => {
      const quantity = toNumber(item.quantity);
      const lineTotal =
        toNumber(item.totalPrice) || quantity * toNumber(item.unitPrice);
      const product = item.product;
      const sub = item.subProduct;
      const code = (sub?.subProductCode ||
        product?.productCode ||
        "") as string;
      const name = [product?.name, sub?.name].filter(Boolean).join(" - ");
      return {
        quantity: amount(-quantity),
        itemId: settings.includeItemId ? toId(code) : "",
        description: (name || code || "Item").slice(0, MAX_DESCRIPTION),
        account: "",
        unitPrice: amount(toNumber(item.unitPrice)),
        amount: -lineTotal,
      };
    });

    const discount = toNumber(sell.discount);
    if (discount > 0)
      lines.push({
        quantity: "",
        itemId: "",
        description: "Discount",
        account: "",
        unitPrice: "",
        amount: discount,
      });

    const vat = toNumber(sell.vat);
    if (vat > 0)
      lines.push({
        quantity: "",
        itemId: "",
        description: "VAT",
        account: "",
        unitPrice: "",
        amount: -vat,
      });

    // A/R is the opposite of the lines, so the invoice always balances
    const receivable = round2(
      -lines.reduce((sum, line) => sum + round2(line.amount), 0),
    );
    const customerId = peachtreeCustomerId(sell, settings);
    const date = formatDate(sell.saleDate, settings.dateFormat);
    const invoiceNo = toId(sell.invoiceNo);

    lines.forEach((line, index) => {
      rows.push([
        customerId,
        invoiceNo,
        date,
        date, // due the same day (cash sale)
        "", // Accounts Receivable account
        amount(receivable),
        lines.length,
        index + 1,
        line.quantity,
        line.itemId,
        line.description,
        line.account,
        line.unitPrice,
        amount(line.amount),
      ]);
    });
    invoices += 1;
    total += receivable;
  });

  return { rows, invoices, skipped, total: round2(total) };
};

// Settings the export cannot work without
export const missingPeachtreeSettings = (settings: TPeachtreeSettings) => {
  const missing: string[] = [];
  if (settings.singleCustomer && !settings.customerId.trim())
    missing.push("Customer ID");
  return missing;
};
