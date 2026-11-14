"use client";

// "Export for Peachtree" on the Sales page: the sales of the current filters
// (date range, status, employee, search) as a Peachtree / Sage 50 Sales
// Journal import file. CSV is the file Peachtree imports; the Excel copy has
// the same rows plus a sheet with the import steps.

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ISell } from "@/models/Sell";
import {
  DEFAULT_PEACHTREE_SETTINGS,
  PEACHTREE_SALES_HEADERS,
  TPeachtreeResult,
  TPeachtreeSettings,
  buildPeachtreeSalesRows,
  missingPeachtreeSettings,
} from "@/lib/peachtree-sales";

const STORAGE_KEY = "peachtree-sales-export-settings";

const loadSettings = (): TPeachtreeSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_PEACHTREE_SETTINGS, ...JSON.parse(saved) };
  } catch {
    // Storage blocked: use the defaults
  }
  return DEFAULT_PEACHTREE_SETTINGS;
};

const saveSettings = (settings: TPeachtreeSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not remembered; the export still works
  }
};

const dayText = (iso?: string) =>
  iso ? format(new Date(iso), "yyyy-MM-dd") : "";

const HOW_TO_IMPORT = [
  ["How to import into Peachtree (Sage 50)"],
  [],
  ["1. Make a backup of the company in Peachtree first."],
  [
    "2. The Customer IDs, Item IDs and G/L accounts used in the file must already exist in Peachtree.",
  ],
  [
    "3. Use the .csv file (Peachtree cannot import .xlsx). This Excel copy is for checking only.",
  ],
  [
    "4. In Peachtree: File > Select Import/Export > Accounts Receivable > Sales Journal > Import.",
  ],
  [
    "5. Layout tab: show exactly these fields, in this order (same as the column headings):",
  ],
  ...PEACHTREE_SALES_HEADERS.map((header, index) => [
    `   ${index + 1}. ${header}`,
  ]),
  [
    '6. Options tab: choose the .csv file and tick "First Row Contains Headings". Then OK.',
  ],
  [
    "7. Try one day of sales first and check the invoices in Peachtree before importing a long period.",
  ],
  [],
  [
    "Signs: A/R amount positive; item and VAT lines negative (credits, quantity negative too); discount line positive.",
  ],
  ["Each invoice balances: A/R amount + all its lines = 0."],
  ["Cancelled and not-approved sales are not included."],
];

type TExportPeachtreeProps = {
  // Every sale of the current filters, with item lines
  fetchSells: () => Promise<ISell[]>;
  startDate?: string;
  endDate?: string;
};

export default function ExportPeachtree({
  fetchSells,
  startDate,
  endDate,
}: TExportPeachtreeProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<TPeachtreeSettings>(
    DEFAULT_PEACHTREE_SETTINGS,
  );
  const [busy, setBusy] = useState<"" | "csv" | "xlsx">("");
  const [summary, setSummary] = useState<TPeachtreeResult | null>(null);

  useEffect(() => {
    if (open) setSettings(loadSettings());
  }, [open]);

  const update = (patch: Partial<TPeachtreeSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));

  const period =
    startDate || endDate
      ? `${dayText(startDate) || "…"} to ${dayText(endDate) || "today"}`
      : "last 12 months (no date filter set)";

  const fileBase = `peachtree-sales_${dayText(startDate) || "from-start"}_to_${
    dayText(endDate) || format(new Date(), "yyyy-MM-dd")
  }`;

  const runExport = async (kind: "csv" | "xlsx") => {
    setBusy(kind);
    setSummary(null);
    try {
      const sells = await fetchSells();
      if (sells.length === 0) {
        toast.error("No sales in this period");
        return;
      }
      const missing = missingPeachtreeSettings(sells, settings);
      if (missing.length > 0) {
        toast.error(`Fill in: ${missing.join(", ")}`);
        return;
      }
      saveSettings(settings);

      const result = buildPeachtreeSalesRows(sells, settings);
      if (result.rows.length === 0) {
        toast.error("No sales to export (all cancelled or not approved)");
        setSummary(result);
        return;
      }
      const sheet = XLSX.utils.aoa_to_sheet([
        [...PEACHTREE_SALES_HEADERS],
        ...result.rows,
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Sales Journal");

      if (kind === "csv") {
        XLSX.writeFile(workbook, `${fileBase}.csv`, { bookType: "csv" });
      } else {
        sheet["!cols"] = PEACHTREE_SALES_HEADERS.map((header) => ({
          wch: header === "Description" ? 40 : Math.max(12, header.length + 2),
        }));
        const help = XLSX.utils.aoa_to_sheet(HOW_TO_IMPORT);
        help["!cols"] = [{ wch: 110 }];
        XLSX.utils.book_append_sheet(workbook, help, "How to import");
        XLSX.writeFile(workbook, `${fileBase}.xlsx`);
      }
      setSummary(result);
      toast.success(
        `Exported ${result.invoices} invoice${result.invoices === 1 ? "" : "s"}`,
      );
    } catch (error) {
      console.error("Peachtree export failed:", error);
      toast.error("Could not export the sales");
    } finally {
      setBusy("");
    }
  };

  const field = (
    key: "arAccount" | "salesAccount" | "vatAccount" | "discountAccount",
    label: string,
    placeholder: string,
    hint: string,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`pt-${key}`}>{label}</Label>
      <Input
        id={`pt-${key}`}
        value={settings[key]}
        placeholder={placeholder}
        onChange={(e) => update({ [key]: e.target.value })}
      />
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => {
          setSummary(null);
          setOpen(true);
        }}
      >
        <Download className="h-4 w-4" />
        Export for Peachtree
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export sales for Peachtree</DialogTitle>
            <DialogDescription>
              Sales Journal import file for Peachtree / Sage 50, one row per
              item line. Period: <strong>{period}</strong>. The status, employee
              and search filters of the page apply too; cancelled and
              not-approved sales are left out. Set the date range with the
              page&apos;s date filter.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {field(
              "arAccount",
              "Accounts Receivable account *",
              "e.g. 1100",
              "G/L account the invoice amount is debited to",
            )}
            {field(
              "salesAccount",
              "Sales income account *",
              "e.g. 4000",
              "G/L account for the item lines",
            )}
            {field(
              "vatAccount",
              "VAT payable account",
              "e.g. 2310",
              "Needed when sales have VAT",
            )}
            {field(
              "discountAccount",
              "Sales discount account",
              "e.g. 4900",
              "Needed when sales have a discount",
            )}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={settings.singleCustomer}
                onCheckedChange={(checked) =>
                  update({ singleCustomer: checked === true })
                }
              />
              Use one Customer ID for all sales (cash sales)
            </label>
            {settings.singleCustomer ? (
              <Input
                value={settings.customerId}
                onChange={(e) => update({ customerId: e.target.value })}
                placeholder="e.g. CASH"
                className="max-w-xs"
              />
            ) : (
              <p className="text-muted-foreground text-xs">
                Customer ID = the customer&apos;s company name or name (first 20
                characters). Each must exist as a customer in Peachtree. Sales
                without a customer use &quot;{settings.customerId || "—"}
                &quot;.
              </p>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={settings.includeItemId}
                onCheckedChange={(checked) =>
                  update({ includeItemId: checked === true })
                }
              />
              Fill Item ID with the product / subproduct code (the items must
              exist in Peachtree inventory)
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span>Date format</span>
              <Select
                value={settings.dateFormat}
                onValueChange={(value) =>
                  update({
                    dateFormat: value as TPeachtreeSettings["dateFormat"],
                  })
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs">
                Use the date format of the Peachtree computer&apos;s Windows
                settings.
              </span>
            </div>
          </div>

          {summary && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                <strong>{summary.invoices}</strong> invoice
                {summary.invoices === 1 ? "" : "s"}, {summary.rows.length} line
                {summary.rows.length === 1 ? "" : "s"}, total{" "}
                <strong>
                  {summary.total.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </strong>
                .
              </p>
              {summary.skipped.length > 0 && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Left out ({summary.skipped.length}):{" "}
                  {summary.skipped
                    .slice(0, 10)
                    .map((s) => `${s.invoiceNo} (${s.reason})`)
                    .join(", ")}
                  {summary.skipped.length > 10 ? ", …" : ""}
                </p>
              )}
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Peachtree imports the <strong>.csv</strong> file (File &gt; Select
            Import/Export &gt; Accounts Receivable &gt; Sales Journal). The
            Excel file has the same rows plus the import steps. Try one day
            first.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => runExport("xlsx")}
            >
              {busy === "xlsx" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Excel (.xlsx)
            </Button>
            <Button disabled={!!busy} onClick={() => runExport("csv")}>
              {busy === "csv" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Peachtree import (.csv)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
