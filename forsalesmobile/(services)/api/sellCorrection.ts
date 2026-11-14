import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/(utils)/config';
import { Sell } from '@/(utils)/types';

// A delivered sale with each batch's current shop stock attached
// (same endpoint the web "Return Sell Correction" form uses)
export const getSellForCorrection = async (sellId: string): Promise<Sell> => {
  try {
    const response = await api.get(`/sell/stock/corrections/find/${sellId}`);
    return response.data.sell as Sell;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to load the sale');
  }
};

export const useSellForCorrection = (sellId?: string) =>
  useQuery<Sell, Error>({
    queryKey: ['sells', 'correction', sellId],
    queryFn: () => getSellForCorrection(sellId as string),
    enabled: !!sellId,
    // Stock and earlier corrections change; always load fresh
    staleTime: 0,
  });

export type SellCorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PARTIAL';

export interface SellCorrection {
  id: string;
  status: SellCorrectionStatus;
  reference?: string | null;
  notes?: string | null;
  total: number | string; // signed: a return is negative
  createdAt: string;
  createdBy?: { id: string; name?: string } | null;
  updatedBy?: { id: string; name?: string } | null;
  items: {
    id: string;
    quantity: number; // signed: negative = returned, positive = extra delivered
    unitPrice: number | string;
    totalPrice: number | string;
    itemSaleStatus?: string;
    product?: { name?: string; imageUrl?: string | null } | null;
    subProduct?: { name?: string; imageUrl?: string | null } | null;
    shop?: { name?: string } | null;
    unitOfMeasure?: { name?: string } | null;
    batches: {
      id: string;
      quantity: number; // amount moved from/to this batch (unsigned)
      batch?: { batchNumber?: string } | null;
    }[];
  }[];
}

// Every correction raised on one sale, newest first
export const getSellCorrections = async (sellId: string): Promise<SellCorrection[]> => {
  try {
    const response = await api.get(`/sells/${sellId}/stock-corrections`);
    return response.data.sellStockCorrections || [];
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Failed to load corrections');
  }
};

export const useSellCorrections = (sellId?: string) =>
  useQuery<SellCorrection[], Error>({
    queryKey: ['sells', 'corrections', sellId],
    queryFn: () => getSellCorrections(sellId as string),
    enabled: !!sellId,
  });

export interface SellCorrectionBatchInput {
  batchId: string;
  quantity: number; // negative = returned, positive = extra delivered
}

export interface SellCorrectionItemInput {
  productId: string;
  subProductId?: string;
  shopId?: string;
  unitOfMeasureId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  batches: SellCorrectionBatchInput[];
}

export interface CreateSellCorrectionInput {
  sellId: string;
  reference?: string;
  notes?: string;
  status: 'PENDING';
  total: number;
  items: SellCorrectionItemInput[];
}

export const createSellCorrection = async (data: CreateSellCorrectionInput) => {
  try {
    const response = await api.post('/sell-stock-corrections', data);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 403) {
      throw new Error('You do not have permission to create sale corrections.');
    }
    throw new Error(error.response?.data?.message || 'Failed to create the correction');
  }
};

export const useCreateSellCorrection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSellCorrection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sells'] });
    },
  });
};
