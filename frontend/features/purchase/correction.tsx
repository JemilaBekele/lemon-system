/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { findDuplicateLineMessage } from '@/lib/duplicate-lines';
import { useRouter } from 'next/navigation';
import Select from 'react-select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  getProductBatches,
  getUnitOfMeasuresByProductId
} from '@/service/Product';
import { useCallback, useEffect, useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { getAvailableProductsBySource } from '@/service/productBatchService';
import { IProductBatch } from '@/models/Product';
import { IUnitOfMeasure } from '@/models/UnitOfMeasure';
import { IStockCorrection } from '@/models/StockCorrection';
import {
  createStockCorrection,
  updateStockCorrection
} from '@/service/StockCorrection';
import { TransferEntityType } from '@/models/transfer';
import {
  IPurchase,
  PURCHASE_STATUS_LABELS,
  PurchaseStatus,
  PurchaseItem
} from '@/models/purchase';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  FileText,
  User,
  Calendar,
  Banknote,
  Package,
  Check,
  X,
  Info
} from 'lucide-react';

interface StoreStockItem {
  id: string;
  storeId: string;
  batchId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    productCode: string;
    category?: any;
    subCategory?: any;
    unitOfMeasure?: any;
  };
  batch: {
    id: string;
    batchNumber: string;
    expiryDate?: string;
    price?: number;
    subProduct?: {
      id: string;
      name: string;
    };
  };
  unitOfMeasure: IUnitOfMeasure;
  availableQuantity: number;
  conversionFactor: number;
}

const formatDate = (dateString: string | Date) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formSchema = z.object({
  storeId: z.string().min(1, 'Store ID is required'),
  reason: z.enum([
    'PURCHASE_ERROR',
    'TRANSFER_ERROR',
    'EXPIRED',
    'DAMAGED',
    'MANUAL_ADJUSTMENT'
  ]),
  purchaseId: z.string().min(1, 'Purchase ID is required for purchase corrections'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, 'Product is required'),
        subProductId: z.string().optional(),
        batchId: z.string().optional(),
        unitOfMeasureId: z.string().min(1, 'Unit of measure is required'),
        quantity: z.union([z.number(), z.null()]).optional()
      })
    )
    .min(1, 'At least one item is required')
    .refine(
      (items) =>
        items.some(
          (item) =>
            item.quantity !== null &&
            item.quantity !== 0 &&
            item.quantity !== undefined
        ),
      'At least one item must have a quantity'
    )
});

interface PurchaseCorrectionFormProps {
  purchaseId: string;
  initialData?: IStockCorrection | null;
  isEdit?: boolean;
  purchaseData: IPurchase | null;
}

export default function PurchaseCorrectionForm({
  purchaseId,
  initialData,
  isEdit = false,
  purchaseData
}: PurchaseCorrectionFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [storeStockItems, setStoreStockItems] = useState<StoreStockItem[]>([]);
  const [batches, setBatches] = useState<{ [key: string]: IProductBatch[] }>(
    {}
  );
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<{
    [key: string]: IUnitOfMeasure[];
  }>({});
  const [isMounted, setIsMounted] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState<{
    [key: string]: boolean;
  }>({});
  const [loadingUOM, setLoadingUOM] = useState<{ [key: string]: boolean }>({});
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [initialItemsLoaded, setInitialItemsLoaded] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          items: initialData.items.map((item) => ({
            ...item,
            quantity: null
          }))
        }
      : {
          storeId: purchaseData?.storeId || '',
          reason: 'PURCHASE_ERROR',
          purchaseId,
          reference: '',
          notes: '',
          items: [
            { 
              productId: '', 
              subProductId: '', 
              batchId: '', 
              unitOfMeasureId: '', 
              quantity: null 
            }
          ]
        }
  });

  const storeId = form.watch('storeId');

  const calculateAvailableQuantity = (
    storeStockItem: StoreStockItem | undefined,
    selectedUnitOfMeasureId: string
  ) => {
    if (!storeStockItem || !selectedUnitOfMeasureId) return 0;
    return storeStockItem.quantity;
  };

  const getPastQuantity = (
    productId: string,
    batchId: string,
    unitOfMeasureId: string,
    subProductId?: string
  ) => {
    if (!purchaseData?.items) return 0;

    const purchaseItem = purchaseData.items.find(
      (item) =>
        item.productId.toString() === productId &&
        (!batchId || item.batchId?.toString() === batchId) &&
        (!subProductId || item.subProductId?.toString() === subProductId) &&
        (!unitOfMeasureId || item.unitOfMeasureId?.toString() === unitOfMeasureId)
    );

    return purchaseItem?.quantity || 0;
  };

  const getUniqueProducts = () => {
    const seenProductIds = new Set<string>();
    return storeStockItems.filter((item) => {
      if (!seenProductIds.has(item.product.id)) {
        seenProductIds.add(item.product.id);
        return true;
      }
      return false;
    });
  };

  const getSubProductsForProduct = (productId: string) => {
    const subProducts: Array<{ id: string; name: string }> = [];
    
    storeStockItems.forEach((item) => {
      if (item.product.id === productId && item.batch.subProduct) {
        subProducts.push({
          id: item.batch.subProduct.id,
          name: item.batch.subProduct.name
        });
      }
    });
    
    const uniqueSubProducts = Array.from(
      new Map(subProducts.map(item => [item.id, item])).values()
    );
    
    return uniqueSubProducts;
  };

  const getFilteredBatches = (productId: string, subProductId?: string) => {
    return storeStockItems.filter((item) => {
      if (item.product.id !== productId) return false;
      
      if (subProductId) {
        return item.batch.subProduct?.id === subProductId;
      }
      
      return true;
    });
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchUnitsOfMeasure = useCallback(
    async (productId: string) => {
      if (!productId) return;

      if (!unitsOfMeasure[productId] && !loadingUOM[productId]) {
        setLoadingUOM((prev) => ({ ...prev, [productId]: true }));
        try {
          const uomData = await getUnitOfMeasuresByProductId(productId);
          setUnitsOfMeasure((prev) => ({
            ...prev,
            [productId]: Array.isArray(uomData) ? uomData : uomData ? [uomData] : []
          }));
        } catch {
          toast.error('Failed to load units of measure');
          setUnitsOfMeasure((prev) => ({ ...prev, [productId]: [] }));
        } finally {
          setLoadingUOM((prev) => ({ ...prev, [productId]: false }));
        }
      }
    },
    [unitsOfMeasure, loadingUOM]
  );

  const fetchBatches = useCallback(
    async (productId: string) => {
      if (!batches[productId]) {
        setLoadingBatches((prev) => ({ ...prev, [productId]: true }));
        try {
          const batchData = await getProductBatches(productId);
          setBatches((prev) => ({ ...prev, [productId]: batchData }));
        } catch {
          toast.error('Failed to load batches');
        } finally {
          setLoadingBatches((prev) => ({ ...prev, [productId]: false }));
        }
      }
    },
    [batches]
  );

  useEffect(() => {
    if (isEdit && initialData && !initialItemsLoaded) {
      const loadInitialUnits = async () => {
        for (const item of initialData.items) {
          const productId = item.productId.toString();
          await fetchUnitsOfMeasure(productId);
        }
        setInitialItemsLoaded(true);
      };
      loadInitialUnits();
    }
  }, [isEdit, initialData, initialItemsLoaded, fetchUnitsOfMeasure]);

  useEffect(() => {
    const fetchProductsFromStore = async () => {
      if (!storeId) return;

      setLoadingProducts(true);
      try {
        const stockData = await getAvailableProductsBySource(
          TransferEntityType.STORE,
          storeId
        );
        setStoreStockItems(stockData);
      } catch {
        toast.error('Failed to load products from store');
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProductsFromStore();
  }, [storeId]);

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    return () => observer.disconnect();
  }, []);

  const darkStyles = {
    control: (base: any) => ({
      ...base,
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      color: '#f9fafb'
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: '#1f2937',
      color: '#f9fafb'
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isFocused ? '#374151' : '#1f2937',
      color: '#f9fafb'
    }),
    singleValue: (base: any) => ({
      ...base,
      color: '#f9fafb'
    }),
    input: (base: any) => ({
      ...base,
      color: '#f9fafb'
    }),
    placeholder: (base: any) => ({
      ...base,
      color: '#9ca3af'
    })
  };

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      const filteredItems = data.items.filter(
        (item) =>
          item.quantity !== null &&
          item.quantity !== undefined &&
          item.quantity !== 0
      );

      if (filteredItems.length === 0) {
        toast.error('At least one item must have a quantity');
        setIsLoading(false);
        return;
      }

      const duplicateMessage = findDuplicateLineMessage(filteredItems);
      if (duplicateMessage) {
        toast.error(duplicateMessage);
        setIsLoading(false);
        return;
      }

      const payload = {
        ...data,
        items: filteredItems.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          subProductId: item.subProductId || undefined
        }))
      };

      if (isEdit && initialData?.id) {
        await updateStockCorrection(initialData.id, payload);
        toast.success('Purchase correction updated successfully');
      } else {
        await createStockCorrection(payload);
        toast.success('Purchase correction created successfully');
      }

      router.push('/dashboard/purchase');
      router.refresh();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        'An error occurred while saving purchase correction.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) {
    return (
      <Card className='mx-auto w-full'>
        <CardHeader>
          <CardTitle className='text-left text-2xl font-bold'>
            {isEdit ? 'Edit Purchase Correction' : 'Create Purchase Correction'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!purchaseData) {
    return (
      <Card className='mx-auto w-full'>
        <CardHeader>
          <CardTitle className='text-left text-2xl font-bold'>
            Purchase Not Found
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>The requested purchase could not be found.</div>
        </CardContent>
      </Card>
    );
  }

  const grandTotal =
    purchaseData.items?.reduce((total, item) => {
      return total + (item.totalPrice || 0);
    }, 0) || 0;

  return (
    <div className='space-y-6'>
      <Card className='shadow-lg'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-2xl font-bold'>
            <Package className='text-primary' />
            Purchase {purchaseData.invoiceNo || purchaseData.id}
            <Badge
              variant={
                purchaseData.status === PurchaseStatus.RECEIVED
                  ? 'default'
                  : purchaseData.status === PurchaseStatus.REJECTED
                    ? 'destructive'
                    : 'secondary'
              }
              className='ml-2'
            >
              {purchaseData.status === PurchaseStatus.RECEIVED ? (
                <Check className='mr-1 h-3 w-3' />
              ) : purchaseData.status === PurchaseStatus.REJECTED ? (
                <X className='mr-1 h-3 w-3' />
              ) : null}
              {PURCHASE_STATUS_LABELS[purchaseData.status] ??
                purchaseData.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-lg font-semibold'>
                <Info className='text-primary h-5 w-5' />
                Purchase Information
              </h3>
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <FileText className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Invoice Number:</span>{' '}
                    {purchaseData.invoiceNo || 'N/A'}
                  </p>
                </div>
                {purchaseData.supplier && (
                  <div className='flex items-center gap-2'>
                    <User className='text-muted-foreground h-4 w-4' />
                    <p>
                      <span className='font-medium'>Supplier:</span>{' '}
                      {purchaseData.supplier.name || 'Unknown Supplier'}
                    </p>
                  </div>
                )}
                {purchaseData.store && (
                  <div className='flex items-center gap-2'>
                    <User className='text-muted-foreground h-4 w-4' />
                    <p>
                      <span className='font-medium'>Store:</span>{' '}
                      {purchaseData.store.name || 'Unknown Store'}
                    </p>
                  </div>
                )}
                {purchaseData.createdBy && (
                  <div className='flex items-center gap-2'>
                    <User className='text-muted-foreground h-4 w-4' />
                    <p>
                      <span className='font-medium'>Created By:</span>{' '}
                      {purchaseData.createdBy.name || 'Unknown Employee'}
                    </p>
                  </div>
                )}
                {purchaseData.updatedBy && (
                  <div className='flex items-center gap-2'>
                    <User className='text-muted-foreground h-4 w-4' />
                    <p>
                      <span className='font-medium'>Updated By:</span>{' '}
                      {purchaseData.updatedBy.name || 'Unknown Employee'}
                    </p>
                  </div>
                )}
                {purchaseData.notes && (
                  <div>
                    <p className='font-medium'>Notes:</p>
                    <p className='text-muted-foreground'>{purchaseData.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-lg font-semibold'>
                <Calendar className='text-primary h-5 w-5' />
                Financial Details
              </h3>
              <div className='space-y-2'>
                <div>
                  <p className='font-medium'>Purchase Date:</p>
                  <p className='text-muted-foreground'>
                    {formatDate(purchaseData.purchaseDate)}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Banknote className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Total:</span>{' '}
                    {grandTotal.toFixed(2)}
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <Package className='text-muted-foreground h-4 w-4' />
                  <p>
                    <span className='font-medium'>Total Products:</span>{' '}
                    {purchaseData.totalProducts || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {purchaseData.items && purchaseData.items.length > 0 ? (
            <div className='space-y-4'>
              <h3 className='text-lg font-semibold'>Purchased Items</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Sub-product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseData.items.map((item: PurchaseItem, index: number) => (
                    <TableRow key={item.id || `${item.productId}-${index}`}>
                      <TableCell className='font-medium'>
                        {item.product?.name || 'Unknown Product'}
                      </TableCell>
                      <TableCell>
                        {item.subProduct?.name || item.subProductId || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {item.batch?.batchNumber || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {item.unitOfMeasure?.name || 'Unknown Unit'}
                      </TableCell>
                      <TableCell>{item.quantity || 0}</TableCell>
                      <TableCell>{(item.unitPrice || 0).toFixed(2)}</TableCell>
                      <TableCell>{(item.totalPrice || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className='text-muted-foreground'>
              No items found for this purchase
            </div>
          )}
        </CardContent>
      </Card>

      <Card className='mx-auto w-full'>
        <CardHeader>
          <CardTitle className='text-left text-2xl font-bold'>
            {isEdit ? 'Edit Purchase Correction' : 'Create Purchase Correction'}
          </CardTitle>
          <p className='text-muted-foreground text-sm'>
            Correcting purchase {purchaseData.invoiceNo || purchaseData.id}
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              <FormField
                control={form.control}
                name='purchaseId'
                render={({ field }) => (
                  <FormItem className='hidden'>
                    <FormControl>
                      <Input type='hidden' {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='storeId'
                render={({ field }) => (
                  <FormItem className='hidden'>
                    <FormControl>
                      <Input type='hidden' {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='reason'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <ShadcnSelect
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select reason' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='PURCHASE_ERROR'>
                            Purchase Error
                          </SelectItem>
                        </SelectContent>
                      </ShadcnSelect>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='reference'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder='Enter reference' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='items'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correction Items</FormLabel>
                    {loadingProducts && (
                      <div className='text-muted-foreground mb-2 text-sm'>
                        Loading products from store...
                      </div>
                    )}
                    <FormControl>
                      <div className='space-y-4'>
                        <div className='grid grid-cols-8 gap-4 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                          <div>Product</div>
                          <div>Sub-product</div>
                          <div>Batch</div>
                          <div>Unit</div>
                          <div>Past Quantity</div>
                          <div>Adjust by (Quantity)</div>
                          <div>Available</div>
                          <div>Action</div>
                        </div>
                        
                        {field.value.map((item, index) => {
                          const storeStockItem = storeStockItems.find(
                            (stock) =>
                              stock.product.id.toString() === item.productId &&
                              (!item.subProductId || stock.batch.subProduct?.id === item.subProductId) &&
                              (!item.batchId || stock.batchId === item.batchId)
                          );
                          
                          const availableInSelectedUnit = storeStockItem
                            ? calculateAvailableQuantity(storeStockItem, item.unitOfMeasureId)
                            : 0;
                          
                          const pastQuantity = getPastQuantity(
                            item.productId,
                            item.batchId || '',
                            item.unitOfMeasureId,
                            item.subProductId || ''
                          );
                          
                          const uniqueProducts = getUniqueProducts();
                          const productOptions =
                            isEdit && initialItemsLoaded
                              ? [
                                  ...uniqueProducts.map((storeStockItem) => ({
                                    value: storeStockItem.product.id.toString(),
                                    label: `${storeStockItem.product.name} (${storeStockItem.product.productCode})`,
                                    data: storeStockItem
                                  })),
                                  ...(item.productId &&
                                  !uniqueProducts.some(
                                    (stock) =>
                                      stock.product.id.toString() === item.productId
                                  )
                                    ? [
                                        {
                                          value: item.productId,
                                          label: `[Current] ${
                                            initialData?.items.find(
                                              (i) =>
                                                i.productId.toString() === item.productId
                                            )?.product?.name || item.productId
                                          }`,
                                          data: null
                                        }
                                      ]
                                    : [])
                                ]
                              : uniqueProducts.map((storeStockItem) => ({
                                  value: storeStockItem.product.id.toString(),
                                  label: `${storeStockItem.product.name} (${storeStockItem.product.productCode})`,
                                  data: storeStockItem
                                }));

                          const subProducts = item.productId 
                            ? getSubProductsForProduct(item.productId)
                            : [];

                          const subProductOptions = [
                            { value: '', label: 'None' },
                            ...subProducts.map((subProduct) => ({
                              value: subProduct.id,
                              label: subProduct.name
                            }))
                          ];

                          const filteredStockItems = getFilteredBatches(
                            item.productId, 
                            item.subProductId
                          );
                          
                          const batchOptions = filteredStockItems.map((stock) => ({
                            value: stock.batchId.toString(),
                            label: `${stock.batch.batchNumber}`,
                            data: stock
                          }));

                          return (
                            <div
                              key={index}
                              className='grid grid-cols-8 items-center gap-4'
                            >
                              <div>
                                <Select
                                  instanceId={`product-select-${index}`}
                                  options={productOptions}
                                  onChange={async (newValue) => {
                                    const newItems = [...field.value];
                                    newItems[index].productId = newValue?.value || '';
                                    newItems[index].subProductId = '';
                                    newItems[index].batchId = '';
                                    newItems[index].unitOfMeasureId = '';
                                    newItems[index].quantity = null;
                                    field.onChange(newItems);
                                    if (newValue?.value) {
                                      await fetchBatches(newValue.value);
                                      await fetchUnitsOfMeasure(newValue.value);
                                    }
                                  }}
                                  value={
                                    productOptions.find(
                                      (p) => p.value === item.productId
                                    ) || null
                                  }
                                  placeholder={
                                    loadingProducts
                                      ? 'Loading products...'
                                      : 'Search product'
                                  }
                                  isSearchable
                                  isDisabled={loadingProducts}
                                  styles={isDark ? darkStyles : {}}
                                />
                              </div>

                              <div>
                                <Select
                                  instanceId={`subproduct-select-${index}`}
                                  options={subProductOptions}
                                  onChange={(newValue) => {
                                    const newItems = [...field.value];
                                    newItems[index].subProductId = newValue?.value || '';
                                    newItems[index].batchId = '';
                                    newItems[index].unitOfMeasureId = '';
                                    field.onChange(newItems);
                                  }}
                                  value={
                                    subProductOptions.find(
                                      (sp) => sp.value === item.subProductId
                                    ) || subProductOptions[0]
                                  }
                                  placeholder="Select sub-product"
                                  isSearchable
                                  isDisabled={!item.productId}
                                  styles={isDark ? darkStyles : {}}
                                />
                              </div>

                              <div>
                                <Select
                                  key={`batch-${item.productId}-${item.subProductId}-${batches[item.productId]?.length || 0}`}
                                  instanceId={`batch-select-${index}`}
                                  options={batchOptions}
                                  onChange={(newValue) => {
                                    const newItems = [...field.value];
                                    newItems[index].batchId = newValue?.value || '';
                                    const selectedStock = newValue?.data as StoreStockItem;
                                    if (selectedStock) {
                                      newItems[index].unitOfMeasureId = selectedStock.unitOfMeasure?.id || '';
                                      newItems[index].subProductId = selectedStock.batch.subProduct?.id || '';
                                    }
                                    field.onChange(newItems);
                                  }}
                                  value={
                                    batchOptions.find(
                                      (b) => b.value === item.batchId
                                    ) || null
                                  }
                                  placeholder={
                                    loadingBatches[item.productId]
                                      ? 'Loading...'
                                      : 'Select batch'
                                  }
                                  isSearchable
                                  isDisabled={
                                    !item.productId ||
                                    loadingBatches[item.productId]
                                  }
                                  isLoading={loadingBatches[item.productId]}
                                  styles={isDark ? darkStyles : {}}
                                />
                              </div>

                              <div>
                                <Select
                                  instanceId={`unit-select-${index}`}
                                  options={
                                    unitsOfMeasure[item.productId]?.map(
                                      (unit) => ({
                                        value: unit.id.toString(),
                                        label: unit.name
                                      })
                                    ) || []
                                  }
                                  onChange={(newValue) => {
                                    const newItems = [...field.value];
                                    newItems[index].unitOfMeasureId = newValue?.value || '';
                                    field.onChange(newItems);
                                  }}
                                  value={
                                    unitsOfMeasure[item.productId]
                                      ?.map((u) => ({
                                        value: u.id.toString(),
                                        label: u.name
                                      }))
                                      .find(
                                        (u) => u.value === item.unitOfMeasureId
                                      ) ||
                                    (unitsOfMeasure[item.productId]?.length > 0
                                      ? {
                                          value:
                                            unitsOfMeasure[item.productId][0].id.toString(),
                                          label: unitsOfMeasure[item.productId][0].name
                                        }
                                      : null)
                                  }
                                  placeholder='Search unit'
                                  isSearchable
                                  isDisabled={
                                    !item.productId ||
                                    unitsOfMeasure[item.productId]?.length === 1
                                  }
                                  styles={isDark ? darkStyles : {}}
                                />
                              </div>

                              <div className='text-muted-foreground flex items-center justify-center rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800'>
                                {pastQuantity}
                              </div>

                              <div>
                                <Input
                                  type='number'
                                  placeholder='Enter quantity'
                                  value={
                                    item.quantity === null ? '' : item.quantity
                                  }
                                  onChange={(e) => {
                                    const newItems = [...field.value];
                                    const value = e.target.value;
                                    if (value === '') {
                                      newItems[index].quantity = null;
                                    } else {
                                      const quantity = Number(value);
                                      newItems[index].quantity = isNaN(quantity)
                                        ? null
                                        : quantity;
                                    }
                                    field.onChange(newItems);
                                  }}
                                />
                                <div className='mt-1 text-xs text-gray-500'>
                                  {item.quantity != null && item.quantity < 0
                                    ? 'Subtraction'
                                    : item.quantity != null && item.quantity > 0
                                      ? 'Addition'
                                      : ''}
                                </div>
                              </div>

                              <div className='text-muted-foreground text-sm'>
                                {availableInSelectedUnit > 0
                                  ? `${Math.floor(availableInSelectedUnit)} available`
                                  : 'Out of stock'}
                              </div>

                              <div>
                                <Button
                                  type='button'
                                  variant='destructive'
                                  size='sm'
                                  onClick={() => {
                                    const newItems = [...field.value];
                                    newItems.splice(index, 1);
                                    field.onChange(newItems);
                                  }}
                                  disabled={field.value.length <= 1}
                                >
                                  <IconTrash size={16} />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        
                        <div className='flex justify-end'>
                          <Button
                            type='button'
                            onClick={() => {
                              field.onChange([
                                ...field.value,
                                {
                                  productId: '',
                                  subProductId: '',
                                  batchId: '',
                                  unitOfMeasureId: '',
                                  quantity: null
                                }
                              ]);
                            }}
                            disabled={loadingProducts}
                          >
                            Add Item
                          </Button>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='notes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter notes (optional)' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='flex justify-end gap-2'>
                <Button type='submit' disabled={isLoading || loadingProducts}>
                  {isEdit ? 'Update' : 'Create'} Purchase Correction
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}