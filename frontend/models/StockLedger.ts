// One row of a product's / sub-product's stock ledger as the detail pages
// receive it from the backend
type TLocation = {
  id: string;
  name: string;
  branch: { id: string; name: string } | null;
} | null;

export interface IStockLedgerEntry {
  id: string;
  invoiceNo: string | null;
  // Set on rows caused by a sale or sale correction
  sale: {
    id: string;
    invoiceNo: string;
    customerName: string | null;
    salesperson: { id: string; name: string } | null;
  } | null;
  unitPrice: number | null;
  movementType: string;
  quantity: number;
  unitOfMeasure: { id: string; name: string; symbol: string } | null;
  reference: string | null;
  userId: string | null;
  user: { id: string; name: string; email?: string } | null;
  store: TLocation;
  shop: TLocation;
  batch: { id: string; batchNumber: string } | null;
  notes: string | null;
  movementDate: string;
  createdAt: string;
  updatedAt?: string;
}
