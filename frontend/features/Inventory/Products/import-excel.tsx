"use client";

// "Import from Excel" on the Products page. The file is read in the browser,
// every row is checked against the categories, sub-categories, units and
// existing products, and the preview marks the rows that cannot be saved.
//
// One row is one product. Rows that share a Name (or a Code, when one is
// given) are one product with sub-products: each of those rows names its
// sub-product in the Subproduct column, and the product columns (category,
// unit…) come from the first row of the product. Sell Price and Ecommerce
// Price are per row: with sub-products they belong to each sub-product and
// the product itself has none.
//
// Code is optional: when it is empty the backend generates a unique one.
//
// Valid products are created one at a time through the normal POST /products
// endpoint, so the server still runs all of its own checks.

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { IconFileSpreadsheet, IconDownload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getCategories, getSubCategories } from "@/service/Category";
import { getUnitsOfMeasure } from "@/service/UnitOfMeasure";
import { createProduct, getProducts } from "@/service/Product";
import { ICategory } from "@/models/Category";
import { IUnitOfMeasure } from "@/models/UnitOfMeasure";

type TSubCategory = {
  id: string;
  name: string;
  code?: string;
  categoryId?: string;
  category?: { id: string };
};

type TLookups = {
  categories: ICategory[];
  subCategories: TSubCategory[];
  units: IUnitOfMeasure[];
  productCodes: Set<string>;
  productNames: Set<string>;
};

type TRowStatus = "ready" | "invalid" | "saving" | "saved" | "failed";

// The cells of one sheet row, as text
type TRawRow = {
  excelRow: number; // row number as shown in Excel (header is row 1)
  name: string;
  productCode: string;
  subProductName: string;
  generic: string;
  description: string;
  categoryLabel: string;
  subCategoryLabel: string;
  unitLabel: string;
  sellPrice: string;
  ecommercePrice: string;
  warningQuantity: string;
};

type TImportRow = {
  excelRow: number;
  groupKey: string; // rows with the same key are one product
  isFirstOfGroup: boolean;
  // Product fields, taken from the first row of the group
  name: string;
  productCode: string;
  generic: string;
  description: string;
  categoryLabel: string;
  subCategoryLabel: string;
  unitLabel: string;
  categoryId?: string;
  subCategoryId?: string;
  unitOfMeasureId?: string;
  warningQuantity: number;
  // This row's own fields: the sub-product's, or the product's when the
  // product has no sub-products
  subProductName: string;
  sellPrice: number | null;
  ecommercePrice: number | null;
  errors: string[];
  status: TRowStatus;
};

// Accepted header spellings for each column, compared after normalizing
// (lower case, letters and digits only).
const COLUMNS = {
  name: ["name", "productname", "product"],
  productCode: ["code", "productcode", "sku"],
  subProductName: [
    "subproduct",
    "subproductname",
    "subproducts",
    "variant",
    "variantname",
  ],
  generic: ["generic", "genericname"],
  description: ["description", "details"],
  category: ["category", "categoryname"],
  subCategory: ["subcategory", "subcategoryname"],
  unit: ["unit", "unitofmeasure", "uom", "unitname"],
  sellPrice: ["sellprice", "price", "sellingprice"],
  ecommercePrice: ["ecommerceprice", "onlineprice", "webprice"],
  warningQuantity: ["warningquantity", "warning", "lowstock", "reorderlevel"],
} as const;

type TColumnKey = keyof typeof COLUMNS;

const TEMPLATE_HEADERS = [
  "Name",
  "Subproduct",
  "Generic",
  "Description",
  "Category",
  "Subcategory",
  "Unit",
  "Sell Price",
  "Ecommerce Price",
  "Warning Quantity",
];

const normalizeHeader = (header: string) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeValue = (value: string) => value.trim().toLowerCase();

const cellText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

// Empty cell -> null; anything that is not a non-negative number -> NaN
const parseAmount = (value: string) => {
  if (value === "") return null;
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : NaN;
};

// Find the sheet column for each field from the header row
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

const findByNameOrCode = <T extends { name: string; code?: string }>(
  items: T[],
  label: string,
) => {
  const wanted = normalizeValue(label);
  return items.find(
    (item) =>
      normalizeValue(item.name) === wanted ||
      (item.code && normalizeValue(item.code) === wanted),
  );
};

// Product columns that later rows of the same code may leave empty; when
// filled they must match the first row.
const SHARED_FIELDS: [keyof TRawRow, string][] = [
  ["name", "Name"],
  ["generic", "Generic"],
  ["description", "Description"],
  ["categoryLabel", "Category"],
  ["subCategoryLabel", "Subcategory"],
  ["unitLabel", "Unit"],
  ["warningQuantity", "Warning quantity"],
];

const buildRows = (
  sheetRows: Record<string, unknown>[],
  columns: Partial<Record<TColumnKey, string>>,
  lookups: TLookups,
): TImportRow[] => {
  const read = (row: Record<string, unknown>, key: TColumnKey) =>
    columns[key] ? cellText(row[columns[key]!]) : "";

  const rawRows: TRawRow[] = sheetRows
    .map((row, index) => ({ row, excelRow: index + 2 }))
    .filter(({ row }) =>
      Object.values(row).some((value) => cellText(value) !== ""),
    )
    .map(({ row, excelRow }) => ({
      excelRow,
      name: read(row, "name"),
      productCode: read(row, "productCode"),
      subProductName: read(row, "subProductName"),
      generic: read(row, "generic"),
      description: read(row, "description"),
      categoryLabel: read(row, "category"),
      subCategoryLabel: read(row, "subCategory"),
      unitLabel: read(row, "unit"),
      sellPrice: read(row, "sellPrice"),
      ecommercePrice: read(row, "ecommercePrice"),
      warningQuantity: read(row, "warningQuantity"),
    }));

  // Group rows by code, or by name when there is no code, keeping the order
  // of first appearance
  const groups = new Map<string, TRawRow[]>();
  rawRows.forEach((raw) => {
    const key = raw.productCode
      ? `code:${normalizeValue(raw.productCode)}`
      : raw.name
        ? `name:${normalizeValue(raw.name)}`
        : `row:${raw.excelRow}`;
    groups.set(key, [...(groups.get(key) || []), raw]);
  });

  const namesInFile = new Map<string, number>();
  const result: TImportRow[] = [];

  groups.forEach((groupRows, groupKey) => {
    const main = groupRows[0];
    const productErrors: string[] = [];

    if (!main.name) productErrors.push("Missing name");
    if (
      main.productCode &&
      lookups.productCodes.has(normalizeValue(main.productCode))
    )
      productErrors.push("Code already exists");

    if (main.name) {
      const key = normalizeValue(main.name);
      if (lookups.productNames.has(key))
        productErrors.push("Name already exists");
      else if (namesInFile.has(key))
        productErrors.push(`Same name as row ${namesInFile.get(key)}`);
      else namesInFile.set(key, main.excelRow);
    }

    const category = main.categoryLabel
      ? findByNameOrCode(lookups.categories, main.categoryLabel)
      : undefined;
    if (!main.categoryLabel) productErrors.push("Missing category");
    else if (!category)
      productErrors.push(`Unknown category "${main.categoryLabel}"`);

    let subCategoryId: string | undefined;
    if (main.subCategoryLabel) {
      const candidates = lookups.subCategories.filter(
        (sub) =>
          !category || (sub.category?.id || sub.categoryId) === category.id,
      );
      const subCategory = findByNameOrCode(candidates, main.subCategoryLabel);
      if (subCategory) subCategoryId = subCategory.id;
      else if (category)
        productErrors.push(
          `Subcategory "${main.subCategoryLabel}" is not in "${category.name}"`,
        );
      else
        productErrors.push(`Unknown subcategory "${main.subCategoryLabel}"`);
    }

    const wantedUnit = normalizeValue(main.unitLabel);
    const unit = main.unitLabel
      ? lookups.units.find(
          (u) =>
            normalizeValue(u.name) === wantedUnit ||
            (u.symbol && normalizeValue(u.symbol) === wantedUnit),
        )
      : undefined;
    if (!main.unitLabel) productErrors.push("Missing unit");
    else if (!unit) productErrors.push(`Unknown unit "${main.unitLabel}"`);

    const warning = parseAmount(main.warningQuantity);
    if (
      Number.isNaN(warning) ||
      (warning !== null && !Number.isInteger(warning))
    )
      productErrors.push("Warning quantity must be a whole number");

    const several = groupRows.length > 1;
    const subNames = new Map<string, number>();

    const rowErrors = groupRows.map((raw, index) => {
      const errors = index === 0 ? [...productErrors] : [];

      if (index > 0) {
        SHARED_FIELDS.forEach(([field, label]) => {
          const value = raw[field] as string;
          if (
            value &&
            normalizeValue(value) !== normalizeValue(main[field] as string)
          )
            errors.push(`${label} differs from row ${main.excelRow}`);
        });
      }

      if (several && !raw.subProductName)
        errors.push(
          `"${main.productCode || main.name}" is on several rows, so each needs a Subproduct name`,
        );
      if (raw.subProductName) {
        const key = normalizeValue(raw.subProductName);
        if (subNames.has(key))
          errors.push(
            `Same subproduct as row ${subNames.get(key)} of this product`,
          );
        else subNames.set(key, raw.excelRow);
      }

      if (Number.isNaN(parseAmount(raw.sellPrice)))
        errors.push("Sell price is not a number");
      if (Number.isNaN(parseAmount(raw.ecommercePrice)))
        errors.push("Ecommerce price is not a number");
      return errors;
    });

    // A product is saved whole or not at all
    const badRows = groupRows
      .filter((_, index) => rowErrors[index].length > 0)
      .map((raw) => raw.excelRow);

    groupRows.forEach((raw, index) => {
      const errors = rowErrors[index];
      if (errors.length === 0 && badRows.length > 0)
        errors.push(
          `Not imported until row ${badRows.join(", ")} of this product is fixed`,
        );
      const sellPrice = parseAmount(raw.sellPrice);
      const ecommercePrice = parseAmount(raw.ecommercePrice);
      result.push({
        excelRow: raw.excelRow,
        groupKey,
        isFirstOfGroup: index === 0,
        name: main.name,
        productCode: main.productCode,
        generic: main.generic,
        description: main.description,
        categoryLabel: main.categoryLabel,
        subCategoryLabel: main.subCategoryLabel,
        unitLabel: main.unitLabel,
        categoryId: category?.id,
        subCategoryId,
        unitOfMeasureId: unit?.id,
        warningQuantity:
          warning === null || Number.isNaN(warning) ? 0 : warning,
        subProductName: raw.subProductName,
        sellPrice: Number.isNaN(sellPrice) ? null : sellPrice,
        ecommercePrice: Number.isNaN(ecommercePrice) ? null : ecommercePrice,
        errors,
        status: errors.length ? "invalid" : "ready",
      });
    });
  });

  return result;
};

const priceText = (price: number | null) =>
  price === null ? "" : String(price);

// Same fields the product form sends
const toFormData = (groupRows: TImportRow[]) => {
  const main = groupRows[0];
  const subProducts = groupRows.filter((row) => row.subProductName);
  const formData = new FormData();
  formData.append("name", main.name);
  // No code: the backend generates a unique one
  if (main.productCode) formData.append("productCode", main.productCode);
  formData.append("categoryId", main.categoryId!);
  formData.append("unitOfMeasureId", main.unitOfMeasureId!);
  if (main.subCategoryId) formData.append("subCategoryId", main.subCategoryId);
  if (main.generic) formData.append("generic", main.generic);
  if (main.description) formData.append("description", main.description);
  formData.append("warningQuantity", String(main.warningQuantity));
  formData.append("isActive", "true");
  formData.append("imageUrl", "");

  if (subProducts.length === 0) {
    formData.append("sellPrice", priceText(main.sellPrice));
    formData.append("ecommercePrice", priceText(main.ecommercePrice));
  } else {
    // With sub-products the prices belong to each sub-product
    formData.append("sellPrice", "");
    formData.append("ecommercePrice", "");
    subProducts.forEach((sub, index) => {
      const key = `subProducts[${index}]`;
      formData.append(`${key}[name]`, sub.subProductName);
      formData.append(`${key}[isActive]`, "true");
      formData.append(`${key}[sellPrice]`, priceText(sub.sellPrice));
      formData.append(`${key}[ecommercePrice]`, priceText(sub.ecommercePrice));
      formData.append(`${key}[hasAdditionalPrices]`, "1");
    });
  }
  return formData;
};

const errorMessage = (error: unknown) => {
  const err = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return err?.response?.data?.message || err?.message || "Could not save";
};

// Template with one plain product and one product with two sub-products.
// It uses a real category and unit when they can be loaded, so the example
// rows pass the checks as they are.
const downloadTemplate = async () => {
  let categoryName = "Category name";
  let unitName = "Unit name";
  try {
    const [categories, units] = await Promise.all([
      getCategories(),
      getUnitsOfMeasure(),
    ]);
    if (categories?.[0]?.name) categoryName = categories[0].name;
    if (units?.[0]?.name) unitName = units[0].name;
  } catch {
    // Keep the placeholders
  }

  const products = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    // Product without sub-products: one row, Subproduct left empty
    [
      "Nitrile examination gloves",
      "",
      "Nitrile gloves",
      "Powder-free, box of 100",
      categoryName,
      "",
      unitName,
      450,
      500,
      10,
    ],
    // Product with 2 sub-products: one row per sub-product, same Name
    [
      "Composite resin",
      "Shade A1",
      "Light-cure composite",
      "Universal composite, 4 g syringe",
      categoryName,
      "",
      unitName,
      1200,
      1300,
      5,
    ],
    [
      "Composite resin",
      "Shade A2",
      "Light-cure composite",
      "Universal composite, 4 g syringe",
      categoryName,
      "",
      unitName,
      1250,
      1350,
      5,
    ],
  ]);
  products["!cols"] = TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(14, header.length + 2),
  }));
  products["!cols"][0] = { wch: 28 };
  products["!cols"][3] = { wch: 32 };

  const help = XLSX.utils.aoa_to_sheet([
    ["How to fill the Products sheet"],
    [],
    ["Column", "Required", "What to put"],
    ["Name", "Yes", "Product name. Must not already exist."],
    [
      "Subproduct",
      "No",
      "Leave empty for a normal product. For a product with sub-products, add one row per sub-product with the same Name and put the sub-product name here.",
    ],
    ["Generic", "No", "Generic name."],
    ["Description", "No", "Short description."],
    ["Category", "Yes", "Name (or code) of a category already in the system."],
    [
      "Subcategory",
      "No",
      "Name (or code) of a subcategory of that category.",
    ],
    [
      "Unit",
      "Yes",
      "Name or symbol of a unit of measure already in the system.",
    ],
    [
      "Sell Price",
      "No",
      "Number. On sub-product rows it is that sub-product's sell price (a product with sub-products has no price of its own).",
    ],
    [
      "Ecommerce Price",
      "No",
      "Number. Online shop price. On sub-product rows it is that sub-product's price.",
    ],
    ["Warning Quantity", "No", "Whole number. Low-stock alert level."],
    [],
    [
      "Product codes are generated automatically. (Optional: add a Code column to set your own codes.)",
    ],
    [
      "On the second and later rows of the same product you may leave the other product columns empty; they are taken from the first row.",
    ],
    ["Images and extra prices are added later in the product form."],
  ]);
  help["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 100 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, products, "Products");
  XLSX.utils.book_append_sheet(workbook, help, "How to fill");
  XLSX.writeFile(workbook, "products-import-template.xlsx");
};

export default function ImportProductsExcel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<TImportRow[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName("");
    setMissingColumns([]);
    setOnlyProblems(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadLookups = async (): Promise<TLookups> => {
    const [categories, subCategories, units, products] = await Promise.all([
      getCategories(),
      getSubCategories(),
      getUnitsOfMeasure(),
      getProducts(),
    ]);
    return {
      categories: categories || [],
      subCategories: (subCategories || []) as TSubCategory[],
      units: units || [],
      productCodes: new Set(
        (products || [])
          .map((p) => p.productCode)
          .filter(Boolean)
          .map((code) => normalizeValue(code as string)),
      ),
      productNames: new Set(
        (products || []).map((p) => normalizeValue(p.name || "")),
      ),
    };
  };

  const handleFile = async (file: File) => {
    setIsReading(true);
    setFileName(file.name);
    try {
      const [buffer, lookups] = await Promise.all([
        file.arrayBuffer(),
        loadLookups(),
      ]);
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The file has no sheets");

      const headerRow = (XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
      })[0] || []) as unknown[];
      const headers = headerRow.map(cellText).filter(Boolean);
      const columns = mapColumns(headers);

      const required: [TColumnKey, string][] = [
        ["name", "Name"],
        ["category", "Category"],
        ["unit", "Unit"],
      ];
      setMissingColumns(
        required.filter(([key]) => !columns[key]).map(([, label]) => label),
      );

      const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        { defval: "", raw: false },
      );
      const built = buildRows(sheetRows, columns, lookups);
      setRows(built);
      if (built.length === 0) toast.error("No product rows found in the file");
    } catch (error) {
      console.error("Excel import read failed:", error);
      toast.error(
        error instanceof Error && error.message
          ? `Could not read the file: ${error.message}`
          : "Could not read the file",
      );
      reset();
    } finally {
      setIsReading(false);
    }
  };

  const updateGroup = (groupKey: string, patch: Partial<TImportRow>) =>
    setRows((current) =>
      current.map((row) =>
        row.groupKey === groupKey ? { ...row, ...patch } : row,
      ),
    );

  // Products whose rows are all ready, in file order
  const readyGroups = (() => {
    const byKey = new Map<string, TImportRow[]>();
    rows.forEach((row) =>
      byKey.set(row.groupKey, [...(byKey.get(row.groupKey) || []), row]),
    );
    return [...byKey.values()].filter((groupRows) =>
      groupRows.every((row) => row.status === "ready"),
    );
  })();

  const importValidRows = async () => {
    const toSave = readyGroups;
    if (toSave.length === 0) return;
    setIsImporting(true);
    let saved = 0;
    // One at a time: the server checks code/name uniqueness per request
    for (const groupRows of toSave) {
      const { groupKey } = groupRows[0];
      updateGroup(groupKey, { status: "saving" });
      try {
        await createProduct(toFormData(groupRows));
        updateGroup(groupKey, { status: "saved" });
        saved += 1;
      } catch (error) {
        updateGroup(groupKey, {
          status: "failed",
          errors: [errorMessage(error)],
        });
      }
    }
    setIsImporting(false);
    const failed = toSave.length - saved;
    if (failed === 0) toast.success(`Imported ${saved} products`);
    else
      toast.warning(
        `Imported ${saved} products, ${failed} failed. See the marked rows.`,
      );
  };

  const readyProducts = readyGroups.length;
  const readySubProducts = readyGroups
    .flat()
    .filter((row) => row.subProductName).length;
  const problemCount = rows.filter(
    (r) => r.status === "invalid" || r.status === "failed",
  ).length;
  const savedProducts = rows.filter(
    (r) => r.status === "saved" && r.isFirstOfGroup,
  ).length;
  const visibleRows = onlyProblems
    ? rows.filter((r) => r.status === "invalid" || r.status === "failed")
    : rows;

  return (
    <>
      <Button
        variant="outline"
        className="text-xs md:text-sm"
        onClick={() => setOpen(true)}
      >
        <IconFileSpreadsheet className="mr-2 h-4 w-4" />
        Import from Excel
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (isImporting) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Import products from Excel</DialogTitle>
            <DialogDescription>
              Name, Category and Unit are required; product codes are generated
              automatically. For a product with sub-products, add one row per
              sub-product with the same Name and the sub-product name in the
              Subproduct column. Category, subcategory and unit must match
              names (or codes) already in the system. Download the template
              for an example.
            </DialogDescription>
          </DialogHeader>

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
              disabled={isReading || isImporting}
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
                <Badge variant="secondary">{rows.length} rows</Badge>
                <Badge className="bg-green-600 text-white hover:bg-green-600">
                  {readyProducts} product{readyProducts === 1 ? "" : "s"} ready
                  {readySubProducts > 0 &&
                    ` (${readySubProducts} sub-product${readySubProducts === 1 ? "" : "s"})`}
                </Badge>
                {problemCount > 0 && (
                  <Badge variant="destructive">
                    {problemCount} row{problemCount === 1 ? "" : "s"} with
                    problems
                  </Badge>
                )}
                {savedProducts > 0 && (
                  <Badge variant="outline">{savedProducts} imported</Badge>
                )}
                <label className="ml-auto flex cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    checked={onlyProblems}
                    onChange={(e) => setOnlyProblems(e.target.checked)}
                  />
                  Show only rows with problems
                </label>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr className="text-left">
                      <th className="p-2">Row</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Code</th>
                      <th className="p-2">Subproduct</th>
                      <th className="p-2">Category</th>
                      <th className="p-2">Subcategory</th>
                      <th className="p-2">Unit</th>
                      <th className="p-2 text-right">Sell price</th>
                      <th className="p-2 text-right">Ecommerce price</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const bad =
                        row.status === "invalid" || row.status === "failed";
                      // Later rows of a product repeat its columns; dim them
                      const repeat = row.isFirstOfGroup
                        ? ""
                        : "text-muted-foreground";
                      return (
                        <tr
                          key={row.excelRow}
                          className={
                            bad
                              ? "border-t bg-red-50 dark:bg-red-950/30"
                              : row.status === "saved"
                                ? "border-t bg-green-50 dark:bg-green-950/30"
                                : "border-t"
                          }
                        >
                          <td className="text-muted-foreground p-2">
                            {row.excelRow}
                          </td>
                          <td className={`p-2 ${repeat}`}>
                            {row.isFirstOfGroup
                              ? row.name || "—"
                              : `↳ ${row.name || "—"}`}
                          </td>
                          <td className={`p-2 ${repeat}`}>
                            {row.productCode || (
                              <span className="text-muted-foreground italic">
                                Auto
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-medium">
                            {row.subProductName || "—"}
                          </td>
                          <td className={`p-2 ${repeat}`}>
                            {row.categoryLabel || "—"}
                          </td>
                          <td className={`p-2 ${repeat}`}>
                            {row.subCategoryLabel || "—"}
                          </td>
                          <td className={`p-2 ${repeat}`}>
                            {row.unitLabel || "—"}
                          </td>
                          <td className="p-2 text-right">
                            {row.sellPrice === null
                              ? "—"
                              : row.sellPrice.toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            {row.ecommercePrice === null
                              ? "—"
                              : row.ecommercePrice.toLocaleString()}
                          </td>
                          <td className="p-2">
                            {row.status === "ready" && (
                              <span className="text-green-700 dark:text-green-400">
                                Ready
                              </span>
                            )}
                            {row.status === "saving" && "Saving…"}
                            {row.status === "saved" && (
                              <span className="text-green-700 dark:text-green-400">
                                Imported
                              </span>
                            )}
                            {bad && (
                              <ul className="space-y-0.5 text-red-700 dark:text-red-400">
                                {row.errors.map((error) => (
                                  <li key={error}>• {error}</li>
                                ))}
                              </ul>
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

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isImporting}
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Close
            </Button>
            <Button
              disabled={readyProducts === 0 || isImporting || isReading}
              onClick={importValidRows}
            >
              {isImporting
                ? "Importing…"
                : `Import ${readyProducts} product${readyProducts === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
