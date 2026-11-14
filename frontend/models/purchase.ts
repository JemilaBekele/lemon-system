import { IEmployee } from './employee';
import { IProduct, IProductBatch, ISubProduct } from './Product';
import { IStore } from './store';
import { ISupplier } from './supplier';
import { IUnitOfMeasure } from './UnitOfMeasure';

export interface PurchaseItem {
  batchId: string;
    productId: string;
  subProductId?: string;
    subProduct?: ISubProduct;

  unitOfMeasureId: string; // foreign key
  unitOfMeasure?: IUnitOfMeasure;
    product: IProduct;

  quantity: number;
  unitPrice: number;
  totalPrice: number;
  id?: string;

  batch: IProductBatch;

}
// Goods receipt: stock is booked into the store when it becomes RECEIVED
export enum PurchaseStatus {
  PENDING = 'PENDING',
  RECEIVED = 'RECEIVED',
  REJECTED = 'REJECTED'
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  [PurchaseStatus.PENDING]: 'Pending',
  [PurchaseStatus.RECEIVED]: 'Received',
  [PurchaseStatus.REJECTED]: 'Rejected'
};

// Supplier payment, derived by the backend from amountPaid vs grandTotal
export enum PurchasePaymentStatus {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID'
}

export const PURCHASE_PAYMENT_STATUS_LABELS: Record<
  PurchasePaymentStatus,
  string
> = {
  [PurchasePaymentStatus.UNPAID]: 'Unpaid',
  [PurchasePaymentStatus.PARTIALLY_PAID]: 'Partially paid',
  [PurchasePaymentStatus.PAID]: 'Paid'
};

export interface IPurchase {
  id: string;
  invoiceNo: string;
  supplierId: string;
  storeId: string;
  purchaseDate: Date;
  status: PurchaseStatus;
  paymentStatus: PurchasePaymentStatus;
  amountPaid: number;
  notes?: string;
  totalProducts: number;
  subTotal: number;
  grandTotal: number;
  items: PurchaseItem[];
  supplier?: ISupplier;
  store?: Partial<IStore>;
  createdBy?: IEmployee;
  updatedBy?: IEmployee;
}
