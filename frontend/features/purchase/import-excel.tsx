"use client";

// "Import from Excel" on the Purchase page. Supplier, store, invoice number
// and date are chosen in the dialog; the item lines come from the sheet:
//
//   Product Code | Product | Subproduct Code | Subproduct | Batch Number |
//   Expiry Date | Quantity | Unit Price
//
// Products and sub-products are found by code first, else by name. A batch
// number that already exists for that product (and sub-product) is used as
// is; a new one is created first and then needs an expiry date. Every row
// needs a batch number. The purchase is then
// created through the normal POST /purchases, so it starts PENDING and stock
// is booked when it is received, exactly like a purchase made in the form.

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { format } from "date-fns";
import { IconFileSpreadsheet, IconDownload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { createProductBatchSingle, getProducts } from "@/service/Product";
import { createPurchase } from "@/service/purchase";
import { getStores } from "@/service/store";
import { getSupplier } from "@/service/supplier";

type TNamed = { id: string; name: string };

type TBatch = {
  id: string;
  batchNumber: string;
  productId: string;
  subProductId?: string | null;
  expiryDate?: string | null;
};

type TProduct = {
  id: string;
  name: string;
  productCode?: string;
  subProducts?: { id: string; name: string; subProductCode?: string }[];
  batches?: TBatch[];
};

type TLookups = {
  products: TProduct[];
  batchesByNumber: Map<string, TBatch>;
};

type TItemRow = {
  excelRow: number;
  productLabel: string;
  subProductLabel: string;
  productId?: string;
  productName?: string;
  productCode?: string;
  subProductId?: string;
  subProductName?: string;
  subProductCode?: string;
  batchNumber: string;
  existingBatchId?: string;
  expiryDate: string; // yyyy-mm-dd or "" (existing batch: its own date)
  quantity: number | null;
  unitPrice: number | null;
  errors: string[];
};

const COLUMNS = {
  productCode: ["productcode", "code", "sku"],
  product: ["product", "productname", "name"],
  subProductCode: ["subproductcode", "variantcode"],
  subProduct: ["subproduct", "subproductname", "variant"],
  batchNumber: ["batchnumber", "batch", "batchno", "lot", "lotnumber"],
  expiryDate: ["expirydate", "expiry", "expdate", "expire", "expiredate"],
  quantity: ["quantity", "qty"],
  unitPrice: ["unitprice", "price", "cost", "unitcost", "purchaseprice"],
} as const;

type TColumnKey = keyof typeof COLUMNS;

const TEMPLATE_HEADERS = [
  "Product Code",
  "Product",
  "Subproduct Code",
  "Subproduct",
  "Batch Number",
  "Expiry Date",
  "Quantity",
  "Unit Price",
];

const normalizeHeader = (header: string) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeValue = (value: string) => value.trim().toLowerCase();

const cellText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

// Empty -> null; not a number -> NaN
const parseNumber = (value: string) => {
  if (value === "") return null;
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : NaN;
};

// Excel dates arrive as yyyy-mm-dd (see dateNF below); typed text may be in
// other forms, so anything Date can read is accepted.
const parseDate = (value: string) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Typed day/month/year, e.g. 31/12/2027
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy.map(Number);
    const date = new Date(year, month - 1, day);
    return date.getMonth() === month - 1 && date.getDate() === day
      ? format(date, "yyyy-MM-dd")
      : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, "yyyy-MM-dd");
};

const mapColumns = (headers: string[]) => {
  const mapping: Partial<Record<TColumnKey, string>> = {};
  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    (Object.keys(COLUMNS) as TColumnKey[]).forEach((key) => {
      if (
        !mapping[key] &&
        (COLUMNS[key] as readonly string[]).includes(normalized)
      ) {
        mapping[key] = header;
      }
    });
  });
  return mapping;
};

const buildRows = (
  sheetRows: Record<string, unknown>[],
  columns: Partial<Record<TColumnKey, string>>,
  lookups: TLookups,
): TItemRow[] => {
  const read = (row: Record<string, unknown>, key: TColumnKey) =>
    columns[key] ? cellText(row[columns[key]!]) : "";

  const lines = new Map<string, number>(); // product|sub|batch -> row
  const newBatches = new Map<string, { key: string; row: number }>();

  return sheetRows
    .map((row, index) => ({ row, excelRow: index + 2 }))
    .filter(({ row }) =>
      Object.values(row).some((value) => cellText(value) !== ""),
    )
    .map(({ row, excelRow }) => {
      const errors: string[] = [];
      const productCodeCell = read(row, "productCode");
      const productLabel = read(row, "product");
      const subCodeCell = read(row, "subProductCode");
      const subProductLabel = read(row, "subProduct");
      const batchNumber = read(row, "batchNumber");
      if (!batchNumber) errors.push("Missing batch number");

      // Product: by code first, else by name (a code typed as name works too)
      const byCode = (code: string) =>
        lookups.products.find(
          (p) =>
            p.productCode &&
            normalizeValue(p.productCode) === normalizeValue(code),
        );
      let product: TProduct | undefined;
      if (productCodeCell) {
        product = byCode(productCodeCell);
        if (!product) errors.push(`Unknown product code "${productCodeCell}"`);
        else if (
          productLabel &&
          normalizeValue(product.name) !== normalizeValue(productLabel)
        )
          errors.push(
            `Code ${productCodeCell} is "${product.name}", not "${productLabel}"`,
          );
      } else if (productLabel) {
        product =
          lookups.products.find(
            (p) => normalizeValue(p.name) === normalizeValue(productLabel),
          ) || byCode(productLabel);
        if (!product) errors.push(`Unknown product "${productLabel}"`);
      } else {
        errors.push("Missing product code or name");
      }

      // Sub-product: by code first, else by name, within the product
      type TSub = NonNullable<TProduct["subProducts"]>[number];
      let subProduct: TSub | undefined;
      const subs = product?.subProducts || [];
      if (product && (subCodeCell || subProductLabel)) {
        if (subs.length === 0) {
          errors.push(`"${product.name}" has no subproducts`);
        } else if (subCodeCell) {
          subProduct = subs.find(
            (s) =>
              s.subProductCode &&
              normalizeValue(s.subProductCode) === normalizeValue(subCodeCell),
          );
          if (!subProduct)
            errors.push(
              `"${product.name}" has no subproduct with code "${subCodeCell}"`,
            );
          else if (
            subProductLabel &&
            normalizeValue(subProduct.name) !== normalizeValue(subProductLabel)
          )
            errors.push(
              `Subproduct code ${subCodeCell} is "${subProduct.name}", not "${subProductLabel}"`,
            );
        } else {
          const wantedSub = normalizeValue(subProductLabel);
          subProduct = subs.find(
            (s) =>
              normalizeValue(s.name) === wantedSub ||
              (s.subProductCode &&
                normalizeValue(s.subProductCode) === wantedSub),
          );
          if (!subProduct)
            errors.push(
              `"${product.name}" has no subproduct "${subProductLabel}"`,
            );
        }
      } else if (product && subs.length > 0) {
        errors.push(
          `"${product.name}" has subproducts; give one (${subs
            .map((s) =>
              s.subProductCode ? `${s.subProductCode} ${s.name}` : s.name,
            )
            .join(", ")})`,
        );
      }
      const subProductId = subProduct?.id;

      // Batch: reuse an existing one of this product, else a new one
      let existingBatchId: string | undefined;
      let existingExpiry = "";
      if (batchNumber && product) {
        const existing = lookups.batchesByNumber.get(
          normalizeValue(batchNumber),
        );
        if (existing) {
          const sameOwner =
            existing.productId === product.id &&
            (existing.subProductId || "") === (subProductId || "");
          if (sameOwner) {
            existingBatchId = existing.id;
            existingExpiry = existing.expiryDate
              ? format(new Date(existing.expiryDate), "yyyy-MM-dd")
              : "";
          } else
            errors.push(
              `Batch "${batchNumber}" belongs to another product or subproduct`,
            );
        } else {
          const owner = `${product.id}|${subProductId || ""}`;
          const seen = newBatches.get(normalizeValue(batchNumber));
          if (seen && seen.key !== owner)
            errors.push(
              `Batch "${batchNumber}" is used for another product in row ${seen.row}`,
            );
          else if (!seen)
            newBatches.set(normalizeValue(batchNumber), {
              key: owner,
              row: excelRow,
            });
        }
      }

      if (product && batchNumber) {
        const lineKey = `${product.id}|${subProductId || ""}|${normalizeValue(batchNumber)}`;
        if (lines.has(lineKey))
          errors.push(
            `Same product and batch as row ${lines.get(lineKey)}; combine them`,
          );
        else lines.set(lineKey, excelRow);
      }

      // An existing batch keeps its own expiry date; a new batch needs one
      const expiryDate = parseDate(read(row, "expiryDate"));
      if (expiryDate === null) errors.push("Expiry date is not a date");
      else if (batchNumber && !existingBatchId && !expiryDate)
        errors.push(
          `Batch "${batchNumber}" is new, so an expiry date is required`,
        );

      const quantity = parseNumber(read(row, "quantity"));
      if (quantity === null) errors.push("Missing quantity");
      else if (Number.isNaN(quantity) || quantity <= 0)
        errors.push("Quantity must be greater than 0");
      else if (!Number.isInteger(quantity))
        errors.push("Quantity must be a whole number");

      const unitPrice = parseNumber(read(row, "unitPrice"));
      if (unitPrice === null) errors.push("Missing unit price");
      else if (Number.isNaN(unitPrice) || unitPrice < 0)
        errors.push("Unit price must be 0 or more");

      return {
        excelRow,
        productLabel,
        subProductLabel,
        productId: product?.id,
        productName: product?.name,
        productCode: product?.productCode,
        subProductId,
        subProductName: subProduct?.name,
        subProductCode: subProduct?.subProductCode,
        batchNumber,
        existingBatchId,
        expiryDate: existingBatchId ? existingExpiry : expiryDate || "",
        quantity: quantity === null || Number.isNaN(quantity) ? null : quantity,
        unitPrice:
          unitPrice === null || Number.isNaN(unitPrice) ? null : unitPrice,
        errors,
      };
    });
};

const errorMessage = (error: unknown) => {
  const err = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return err?.response?.data?.message || err?.message || "Something went wrong";
};

const money = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

// Template with a plain product and a product with sub-products, using real
// products when they can be loaded.
const downloadTemplate = async () => {
  const rows: (string | number)[][] = [];
  const nextYear = format(
    new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    "yyyy-MM-dd",
  );
  try {
    const products = ((await getProducts()) || []) as unknown as TProduct[];
    const taken = new Set(
      products.flatMap((p) =>
        (p.batches || []).map((b) => normalizeValue(b.batchNumber)),
      ),
    );
    // A batch number that is not used yet, e.g. PRS009-SUB-001-B01
    const newBatchNumber = (base: string) => {
      for (let n = 1; ; n += 1) {
        const number = `${base}-B${String(n).padStart(2, "0")}`;
        if (!taken.has(normalizeValue(number))) {
          taken.add(normalizeValue(number));
          return number;
        }
      }
    };
    // Existing batch: used as is, no expiry date. Else a new batch number
    // with an expiry date.
    const batchCells = (
      product: TProduct,
      subProductId: string | undefined,
      base: string,
    ): [string, string] => {
      const batch = product.batches?.find(
        (b) => (b.subProductId || undefined) === subProductId,
      );
      return batch ? [batch.batchNumber, ""] : [newBatchNumber(base), nextYear];
    };

    const plain = products.find((p) => !p.subProducts?.length);
    const withSubs = products.find((p) => (p.subProducts?.length || 0) > 0);
    if (plain) {
      const code = plain.productCode || "";
      rows.push([
        code,
        plain.name,
        "",
        "",
        ...batchCells(plain, undefined, code || "BATCH"),
        10,
        100,
      ]);
    }
    if (withSubs) {
      const code = withSubs.productCode || "";
      withSubs
        .subProducts!.slice(0, 2)
        .forEach((sub) =>
          rows.push([
            code,
            withSubs.name,
            sub.subProductCode || "",
            sub.name,
            ...batchCells(
              withSubs,
              sub.id,
              sub.subProductCode || code || "BATCH",
            ),
            5,
            250,
          ]),
        );
    }
  } catch {
    // Fall back to the placeholder rows below
  }
  if (rows.length === 0) {
    rows.push([
      "GLV-001",
      "Nitrile examination gloves",
      "",
      "",
      "GLV-2026-01",
      nextYear,
      20,
      380,
    ]);
    rows.push([
      "CMP-001",
      "Composite resin",
      "CMP-001-01",
      "Shade A1",
      "CMP-001-01-B01",
      nextYear,
      10,
      950,
    ]);
    rows.push([
      "CMP-001",
      "Composite resin",
      "CMP-001-02",
      "Shade A2",
      "CMP-001-02-B01",
      nextYear,
      10,
      950,
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
  sheet["!cols"] = [
    { wch: 16 },
    { wch: 30 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
  ];
  const help = XLSX.utils.aoa_to_sheet([
    ["How to fill the Items sheet"],
    [],
    ["Column", "Required", "What to put"],
    [
      "Product Code",
      "Code or name",
      "Product code from the system. The easiest way to find the product.",
    ],
    [
      "Product",
      "Code or name",
      "Product name. Used when there is no code; with a code it must match.",
    ],
    [
      "Subproduct Code",
      "If the product has subproducts",
      "Subproduct code from the system.",
    ],
    [
      "Subproduct",
      "If the product has subproducts",
      "Subproduct name. Used when there is no subproduct code.",
    ],
    [
      "Batch Number",
      "Yes",
      "Every row, subproducts too. Existing batch of this product/subproduct: used as is (no new batch). New number: a new batch is created.",
    ],
    [
      "Expiry Date",
      "For a new batch",
      "Required when the batch number is new. Ignored for an existing batch. e.g. 2027-12-31.",
    ],
    ["Quantity", "Yes", "Whole number greater than 0."],
    ["Unit Price", "Yes", "Purchase price per unit."],
    [],
    [
      "Supplier, store, invoice number and date are chosen in the import window.",
    ],
  ]);
  help["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 100 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Items");
  XLSX.utils.book_append_sheet(workbook, help, "How to fill");
  XLSX.writeFile(workbook, "purchase-import-template.xlsx");
};

export default function ImportPurchaseExcel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<TNamed[]>([]);
  const [stores, setStores] = useState<TNamed[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<TItemRow[]>([]);
  const [lookups, setLookups] = useState<TLookups | null>(null);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState("");

  const resetFile = () => {
    setRows([]);
    setFileName("");
    setMissingColumns([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetAll = () => {
    resetFile();
    setSupplierId("");
    setStoreId("");
    setInvoiceNo("");
    setNotes("");
    setPurchaseDate(format(new Date(), "yyyy-MM-dd"));
    setProgress("");
  };

  const openDialog = async () => {
    setOpen(true);
    try {
      const [supplierList, storeList] = await Promise.all([
        getSupplier(),
        getStores(),
      ]);
      setSuppliers((supplierList || []) as TNamed[]);
      setStores((storeList || []) as unknown as TNamed[]);
    } catch (error) {
      toast.error(
        `Could not load suppliers and stores: ${errorMessage(error)}`,
      );
    }
  };

  const loadLookups = async (): Promise<TLookups> => {
    const products = ((await getProducts()) || []) as unknown as TProduct[];
    const batchesByNumber = new Map<string, TBatch>();
    products.forEach((product) =>
      (product.batches || []).forEach((batch) =>
        batchesByNumber.set(normalizeValue(batch.batchNumber), {
          ...batch,
          productId: batch.productId || product.id,
        }),
      ),
    );
    return { products, batchesByNumber };
  };

  const handleFile = async (file: File) => {
    setIsReading(true);
    setFileName(file.name);
    try {
      const [buffer, loaded] = await Promise.all([
        file.arrayBuffer(),
        loadLookups(),
      ]);
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The file has no sheets");

      const headerRow = (XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
      })[0] || []) as unknown[];
      const columns = mapColumns(headerRow.map(cellText).filter(Boolean));
      const required: [TColumnKey, string][] = [
        ["quantity", "Quantity"],
        ["unitPrice", "Unit Price"],
      ];
      setMissingColumns([
        ...(columns.product || columns.productCode
          ? []
          : ["Product Code or Product"]),
        ...required.filter(([key]) => !columns[key]).map(([, label]) => label),
      ]);

      const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        { defval: "", raw: false, dateNF: "yyyy-mm-dd" },
      );
      const built = buildRows(sheetRows, columns, loaded);
      setLookups(loaded);
      setRows(built);
      if (built.length === 0) toast.error("No item rows found in the file");
    } catch (error) {
      console.error("Purchase Excel read failed:", error);
      toast.error(`Could not read the file: ${errorMessage(error)}`);
      resetFile();
    } finally {
      setIsReading(false);
    }
  };

  const problemRows = rows.filter((row) => row.errors.length > 0);
  const total = rows.reduce(
    (sum, row) => sum + (row.quantity || 0) * (row.unitPrice || 0),
    0,
  );
  const headerMissing = [
    !supplierId && "supplier",
    !storeId && "store",
    !invoiceNo.trim() && "invoice number",
    !purchaseDate && "purchase date",
  ].filter(Boolean) as string[];
  const canCreate =
    rows.length > 0 &&
    problemRows.length === 0 &&
    missingColumns.length === 0 &&
    headerMissing.length === 0 &&
    !isSaving &&
    !isReading;

  const createFromExcel = async () => {
    if (!canCreate || !lookups) return;
    setIsSaving(true);
    try {
      // 1. Make the batches that do not exist yet
      const batchIds = new Map<string, string>(); // batch number -> id
      const toCreate = rows.filter((row) => !row.existingBatchId);
      let done = 0;
      for (const row of toCreate) {
        const key = normalizeValue(row.batchNumber);
        if (batchIds.has(key)) continue;
        // Made by an earlier try that failed later: use it
        const existing = lookups.batchesByNumber.get(key);
        if (existing) {
          batchIds.set(key, existing.id);
          continue;
        }
        setProgress(`Creating batch ${(done += 1)} of ${toCreate.length}…`);
        const response = await createProductBatchSingle({
          productId: row.productId,
          subProductId: row.subProductId || undefined,
          batchNumber: row.batchNumber,
          expiryDate: row.expiryDate || undefined,
        });
        const created = response?.data;
        if (!created?.id)
          throw new Error(`Batch for row ${row.excelRow} was not created`);
        batchIds.set(key, created.id);
        lookups.batchesByNumber.set(key, created);
      }

      // 2. Create the purchase
      setProgress("Creating purchase…");
      const items = rows.map((row) => {
        const key = normalizeValue(row.batchNumber);
        const quantity = row.quantity!;
        const unitPrice = row.unitPrice!;
        return {
          productId: row.productId!,
          subProductId: row.subProductId || undefined,
          batchId: row.existingBatchId || batchIds.get(key)!,
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
        };
      });
      await createPurchase({
        invoiceNo: invoiceNo.trim(),
        supplierId,
        storeId,
        purchaseDate,
        notes: notes.trim() || undefined,
        items,
      });
      toast.success(
        `Purchase ${invoiceNo.trim()} created with ${items.length} items`,
      );
      setOpen(false);
      resetAll();
    } catch (error) {
      toast.error(
        `Purchase not created: ${errorMessage(error)}. Batches already made are reused if you try again.`,
      );
    } finally {
      setIsSaving(false);
      setProgress("");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="text-xs md:text-sm"
        onClick={openDialog}
      >
        <IconFileSpreadsheet className="mr-2 h-4 w-4" />
        Import from Excel
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (isSaving) return;
          setOpen(next);
          if (!next) resetAll();
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Create purchase from Excel</DialogTitle>
            <DialogDescription>
              Choose the supplier, store and invoice, then upload the items
              (Product Code or Product, Subproduct Code or Subproduct, Batch
              Number, Expiry Date, Quantity, Unit Price). An existing batch
              number is used as is; a new batch needs an expiry date. The
              purchase is created as Pending, like one made in the form.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Store *</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Invoice No *</Label>
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-0012"
              />
            </div>
            <div className="space-y-1">
              <Label>Purchase Date *</Label>
              <Input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1 md:col-span-4">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isReading || isSaving}
            >
              <IconFileSpreadsheet className="mr-2 h-4 w-4" />
              {isReading
                ? "Reading…"
                : fileName
                  ? "Choose another file"
                  : "Choose Excel file"}
            </Button>
            <Button variant="ghost" onClick={downloadTemplate}>
              <IconDownload className="mr-2 h-4 w-4" />
              Download template
            </Button>
            {fileName && (
              <span className="text-muted-foreground truncate text-xs">
                {fileName}
              </span>
            )}
          </div>

          {missingColumns.length > 0 && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Missing column{missingColumns.length > 1 ? "s" : ""}:{" "}
              {missingColumns.join(", ")}. Check the header row (row 1) or use
              the template.
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">{rows.length} items</Badge>
                {problemRows.length > 0 ? (
                  <Badge variant="destructive">
                    {problemRows.length} row
                    {problemRows.length === 1 ? "" : "s"} with problems — fix
                    the file and choose it again
                  </Badge>
                ) : (
                  <Badge className="bg-green-600 text-white hover:bg-green-600">
                    All rows ready
                  </Badge>
                )}
                <span className="ml-auto font-medium">
                  Total: {money(total)}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr className="text-left">
                      <th className="p-2">Row</th>
                      <th className="p-2">Code</th>
                      <th className="p-2">Product</th>
                      <th className="p-2">Subproduct</th>
                      <th className="p-2">Batch</th>
                      <th className="p-2">Expiry</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Unit price</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const bad = row.errors.length > 0;
                      return (
                        <tr
                          key={row.excelRow}
                          className={
                            bad
                              ? "border-t bg-red-50 dark:bg-red-950/30"
                              : "border-t"
                          }
                        >
                          <td className="text-muted-foreground p-2">
                            {row.excelRow}
                          </td>
                          <td className="p-2">{row.productCode || "—"}</td>
                          <td className="p-2">
                            {row.productName || row.productLabel || "—"}
                          </td>
                          <td className="p-2">
                            {row.subProductName || row.subProductLabel || "—"}
                            {row.subProductCode && (
                              <span className="text-muted-foreground ml-1">
                                ({row.subProductCode})
                              </span>
                            )}
                          </td>
                          <td className="p-2">
                            {row.batchNumber || "—"}
                            {!bad && (
                              <span className="text-muted-foreground ml-1">
                                ({row.existingBatchId ? "existing" : "new"})
                              </span>
                            )}
                          </td>
                          <td className="p-2">{row.expiryDate || "—"}</td>
                          <td className="p-2 text-right">
                            {row.quantity ?? "—"}
                          </td>
                          <td className="p-2 text-right">
                            {row.unitPrice === null
                              ? "—"
                              : money(row.unitPrice)}
                          </td>
                          <td className="p-2 text-right">
                            {row.quantity !== null && row.unitPrice !== null
                              ? money(row.quantity * row.unitPrice)
                              : "—"}
                          </td>
                          <td className="p-2">
                            {bad ? (
                              <ul className="space-y-0.5 text-red-700 dark:text-red-400">
                                {row.errors.map((error) => (
                                  <li key={error}>• {error}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-green-700 dark:text-green-400">
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <DialogFooter className="items-center">
            {progress ? (
              <span className="text-muted-foreground mr-auto text-xs">
                {progress}
              </span>
            ) : (
              rows.length > 0 &&
              headerMissing.length > 0 && (
                <span className="mr-auto text-xs text-red-600 dark:text-red-400">
                  Choose the {headerMissing.join(", ")}.
                </span>
              )
            )}
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                setOpen(false);
                resetAll();
              }}
            >
              Close
            </Button>
            <Button disabled={!canCreate} onClick={createFromExcel}>
              {isSaving ? "Creating…" : "Create purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
