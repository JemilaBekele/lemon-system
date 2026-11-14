/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from 'react';
import { IStore } from '@/models/store';
import { getStores } from '@/service/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { 
  Plus, 
  Trash2, 
  Copy, 
  ChevronDown, 
  ChevronUp,
  Package,
  Tag,
  Banknote,
  Store,
  Calendar as CalendarIcon,
  AlertCircle
} from 'lucide-react';
import { createProductBatch, getSubProductsByProductId } from '@/service/Product';
import { ISubProduct } from '@/models/Product';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProductBatchFormProps {
  productId: string;
}

interface BatchFormData {
  batchNumber: string;
  expiryDate?: string;
  price?: number;
  stock?: number;
  storeId?: string;
  subProductId: string; // Made required
}

const ProductBatchForm: React.FC<ProductBatchFormProps> = ({ productId }) => {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchFormData[]>([]);
  const [stores, setStores] = useState<IStore[]>([]);
  const [subProducts, setSubProducts] = useState<ISubProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSubProducts, setIsLoadingSubProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSubProductId, setSelectedSubProductId] = useState<string | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean[]>>({});

  // Fetch subproducts when productId changes
  useEffect(() => {
    const fetchSubProducts = async () => {
      try {
        setIsLoadingSubProducts(true);
        const subProductsData = await getSubProductsByProductId(productId);
        console.log('Fetched subproducts:', subProductsData);
        setSubProducts(subProductsData);
        
        // If there are subproducts, select the first one by default
        if (subProductsData.length > 0) {
          setSelectedSubProductId(subProductsData[0].id);
        }
      } catch (err) {
        console.error('Failed to load subproducts:', err);
      } finally {
        setIsLoadingSubProducts(false);
      }
    };

    if (productId) {
      fetchSubProducts();
    }
  }, [productId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const storesResponse = await getStores();
        setStores(storesResponse);
      } catch (err) {
        setError('Failed to load required data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Initialize batches for a subproduct
  const initializeSubProductBatches = (subProductId: string) => {
    setBatches(prev => [
      ...prev,
      {
        batchNumber: '',
        expiryDate: undefined,
        price: undefined,
        stock: undefined,
        storeId: undefined,
        subProductId: subProductId
      }
    ]);

    // Initialize expanded state for this subproduct
    setExpandedBatches(prev => ({
      ...prev,
      [subProductId]: [true]
    }));
  };

  // Get batches for selected subproduct
  const getBatchesForSelectedSubProduct = () => {
    if (!selectedSubProductId) return [];
    return batches.filter(batch => batch.subProductId === selectedSubProductId);
  };

  const handleBatchChange = (subProductId: string, batchIndex: number, field: string, value: any) => {
    setBatches((prev) => {
      const subProductBatches = prev.filter(b => b.subProductId === subProductId);
      const otherBatches = prev.filter(b => b.subProductId !== subProductId);
      
      const updatedSubProductBatches = subProductBatches.map((batch, index) =>
        index === batchIndex ? { ...batch, [field]: value } : batch
      );
      
      return [...otherBatches, ...updatedSubProductBatches];
    });
  };

  const handleDateSelect = (subProductId: string, batchIndex: number, date: Date | undefined) => {
    handleBatchChange(
      subProductId,
      batchIndex,
      'expiryDate',
      date ? format(date, 'yyyy-MM-dd') : undefined
    );
  };

  const addBatch = (subProductId: string) => {
    setBatches((prev) => [
      ...prev,
      {
        batchNumber: '',
        expiryDate: undefined,
        price: undefined,
        stock: undefined,
        storeId: undefined,
        subProductId: subProductId
      }
    ]);

    // Update expanded state for this subproduct
    setExpandedBatches(prev => {
      const currentExpanded = prev[subProductId] || [];
      return {
        ...prev,
        [subProductId]: [...currentExpanded, true]
      };
    });
  };

  const removeBatch = (subProductId: string, batchIndex: number) => {
    setBatches((prev) => {
      const subProductBatches = prev.filter(b => b.subProductId === subProductId);
      const otherBatches = prev.filter(b => b.subProductId !== subProductId);
      
      if (subProductBatches.length <= 1) return prev;
      
      const updatedSubProductBatches = subProductBatches.filter((_, index) => index !== batchIndex);
      return [...otherBatches, ...updatedSubProductBatches];
    });

    // Update expanded state
    setExpandedBatches(prev => {
      const currentExpanded = prev[subProductId] || [];
      const updatedExpanded = currentExpanded.filter((_, index) => index !== batchIndex);
      return {
        ...prev,
        [subProductId]: updatedExpanded
      };
    });
  };

  const duplicateBatch = (subProductId: string, batchIndex: number) => {
    const subProductBatches = batches.filter(b => b.subProductId === subProductId);
    const batchToDuplicate = { ...subProductBatches[batchIndex] };
    
    setBatches((prev) => [
      ...prev,
      {
        ...batchToDuplicate,
        batchNumber: `${batchToDuplicate.batchNumber}-copy` || ''
      }
    ]);

    // Update expanded state
    setExpandedBatches(prev => {
      const currentExpanded = prev[subProductId] || [];
      return {
        ...prev,
        [subProductId]: [...currentExpanded, true]
      };
    });
  };

  const toggleBatchExpand = (subProductId: string, batchIndex: number) => {
    setExpandedBatches(prev => {
      const currentExpanded = prev[subProductId] || [];
      const updatedExpanded = currentExpanded.map((expanded, index) =>
        index === batchIndex ? !expanded : expanded
      );
      return {
        ...prev,
        [subProductId]: updatedExpanded
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate that all batches have subproducts
      const batchesWithoutSubproduct = batches.filter(b => !b.subProductId);
      if (batchesWithoutSubproduct.length > 0) {
        setError('All batches must be assigned to a subproduct');
        setIsLoading(false);
        return;
      }

      // Opening stock has to be booked into a store
      if (batches.some((b) => (b.stock ?? 0) > 0 && !b.storeId)) {
        setError('Select a store for every batch that has initial stock');
        setIsLoading(false);
        return;
      }

      const batchesData = batches.map((batch) => ({
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        price: batch.price,
        stock: batch.stock,
        storeId: batch.storeId,
        subProductId: batch.subProductId // Now required
      }));

      await createProductBatch(productId, batchesData);
      setSuccess(`Successfully created ${batches.length} batch(es)`);
      setTimeout(() => {
        router.push(`/dashboard/Products`);
      }, 2000);
    } catch (err) {
      setError('Failed to create product batches');
      console.error('Error creating batches:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && stores.length === 0) {
    return <div>Loading form...</div>;
  }

  // If no subproducts exist, show message
  if (!isLoadingSubProducts && subProducts.length === 0) {
    return (
      <Card className='mx-auto w-full'>
        <CardContent className='py-10'>
          <div className='text-center'>
            <AlertCircle className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
            <h3 className='text-lg font-semibold mb-2'>No Sub Products Found</h3>
            <p className='text-muted-foreground mb-4'>
              This product doesn&apos;t have any sub products. Please add sub products first before creating batches.
            </p>
            <Button onClick={() => router.push(`/dashboard/Products`)}>
              Go Back to Products
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='flex h-[calc(100vh-120px)] gap-4'>
      {/* Left Sidebar - Subproducts List */}
      <Card className='w-80 shrink-0'>
        <CardHeader>
          <CardTitle className='text-lg flex items-center gap-2'>
            <Package className='h-5 w-5' />
            Sub Products
            <Badge variant='secondary' className='ml-2'>
              {subProducts.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <ScrollArea className='h-[calc(100vh-250px)]'>
            <div className='px-4 py-2'>
              {isLoadingSubProducts ? (
                <div className='text-center py-4 text-sm text-muted-foreground'>
                  Loading subproducts...
                </div>
              ) : (
                subProducts.map((subProduct) => {
                  const batchCount = batches.filter(b => b.subProductId === subProduct.id).length;
                  return (
                    <Button
                      key={subProduct.id}
                      variant={selectedSubProductId === subProduct.id ? 'default' : 'ghost'}
                      className='w-full justify-start mb-2 h-auto py-3'
                      onClick={() => setSelectedSubProductId(subProduct.id)}
                    >
                      <div className='flex flex-col items-start w-full'>
                        <div className='flex items-center w-full'>
                          <Tag className='mr-2 h-4 w-4 flex-shrink-0' />
                          <span className='truncate flex-1 text-left font-medium'>
                            {subProduct.name}
                          </span>
                        </div>
                        <div className='flex items-center justify-between w-full mt-1 text-xs'>
                          <span className='text-muted-foreground'>
                            {batchCount} {batchCount === 1 ? 'batch' : 'batches'}
                          </span>
                          {selectedSubProductId === subProduct.id && (
                            <Badge variant='secondary' className='text-xs'>
                              Selected
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right Content - Batches for selected subproduct */}
      <Card className='flex-1'>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <span>Batches for</span>
                {selectedSubProductId && (
                  <Badge variant='outline' className='text-base py-1'>
                    {subProducts.find(s => s.id === selectedSubProductId)?.name}
                  </Badge>
                )}
              </CardTitle>
              <p className='text-sm text-muted-foreground mt-1'>
                Create and manage batches for this subproduct
              </p>
            </div>
            {selectedSubProductId && (
              <Button 
                type='button' 
                onClick={() => addBatch(selectedSubProductId)} 
                variant='outline' 
                size='sm'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Batch for {subProducts.find(s => s.id === selectedSubProductId)?.name}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className='h-[calc(100vh-250px)] pr-4'>
            {error && (
              <Alert variant='destructive' className='mb-4'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert variant='default' className='mb-4 border-green-200 bg-green-50'>
                <AlertDescription className='text-green-800'>
                  {success}
                </AlertDescription>
              </Alert>
            )}

            {!selectedSubProductId ? (
              <div className='text-center py-10 text-muted-foreground'>
                <Package className='mx-auto h-12 w-12 mb-4 opacity-50' />
                <p>Select a subproduct from the sidebar to start creating batches</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className='space-y-4'>
                {getBatchesForSelectedSubProduct().length === 0 ? (
                  <div className='text-center py-10 border-2 border-dashed rounded-lg'>
                    <Package className='mx-auto h-12 w-12 mb-4 text-muted-foreground' />
                    <h3 className='text-lg font-semibold mb-2'>No batches yet</h3>
                    <p className='text-muted-foreground mb-4'>
                      Create your first batch for {subProducts.find(s => s.id === selectedSubProductId)?.name}
                    </p>
                    <Button
                      type='button'
                      onClick={() => addBatch(selectedSubProductId)}
                    >
                      <Plus className='mr-2 h-4 w-4' />
                      Create First Batch
                    </Button>
                  </div>
                ) : (
                  getBatchesForSelectedSubProduct().map((batch, batchIndex) => {
                    const isExpanded = expandedBatches[selectedSubProductId]?.[batchIndex] ?? true;
                    
                    return (
                      <div key={batchIndex} className='rounded-lg border'>
                        {/* Batch Header */}
                        <div 
                          className='flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50'
                          onClick={() => toggleBatchExpand(selectedSubProductId, batchIndex)}
                        >
                          <div className='flex items-center gap-4 flex-1'>
                            <div className='flex items-center gap-2'>
                              {isExpanded ? (
                                <ChevronUp className='h-4 w-4' />
                              ) : (
                                <ChevronDown className='h-4 w-4' />
                              )}
                              <span className='font-semibold'>Batch {batchIndex + 1}</span>
                            </div>
                            
                            <div className='flex items-center gap-4 text-sm text-muted-foreground'>
                              {batch.batchNumber && (
                                <span className='flex items-center gap-1'>
                                  <Tag className='h-3 w-3' />
                                  {batch.batchNumber}
                                </span>
                              )}
                              {batch.price && (
                                <span className='flex items-center gap-1'>
                                  <Banknote className='h-3 w-3' />
                                  {batch.price}
                                </span>
                              )}
                              {batch.expiryDate && (
                                <span className='flex items-center gap-1'>
                                  <CalendarIcon className='h-3 w-3' />
                                  {format(new Date(batch.expiryDate), 'MMM yyyy')}
                                </span>
                              )}
                              {batch.storeId && stores.find(s => s.id.toString() === batch.storeId) && (
                                <span className='flex items-center gap-1'>
                                  <Store className='h-3 w-3' />
                                  {stores.find(s => s.id.toString() === batch.storeId)?.name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className='flex space-x-2' onClick={(e) => e.stopPropagation()}>
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              onClick={() => duplicateBatch(selectedSubProductId, batchIndex)}
                            >
                              <Copy className='h-4 w-4' />
                            </Button>
                            {getBatchesForSelectedSubProduct().length > 1 && (
                              <Button
                                type='button'
                                variant='destructive'
                                size='sm'
                                onClick={() => removeBatch(selectedSubProductId, batchIndex)}
                              >
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Batch Details */}
                        {isExpanded && (
                          <div className='p-4 pt-0 border-t'>
                            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4'>
                              <div className='space-y-2'>
                                <Label htmlFor={`batchNumber-${selectedSubProductId}-${batchIndex}`}>
                                  Batch Number *
                                </Label>
                                <Input
                                  id={`batchNumber-${selectedSubProductId}-${batchIndex}`}
                                  value={batch.batchNumber}
                                  onChange={(e) =>
                                    handleBatchChange(
                                      selectedSubProductId,
                                      batchIndex,
                                      'batchNumber',
                                      e.target.value
                                    )
                                  }
                                  required
                                />
                              </div>

                              <div className='space-y-2'>
                                <Label htmlFor={`expiryDate-${selectedSubProductId}-${batchIndex}`}>
                                  Expiry Date
                                </Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant='outline'
                                      className='w-full justify-start text-left font-normal'
                                    >
                                      {batch.expiryDate
                                        ? format(new Date(batch.expiryDate), 'PPP')
                                        : 'Pick a date'}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className='w-auto p-0'>
                                    <Calendar
                                      mode='single'
                                      selected={
                                        batch.expiryDate
                                          ? new Date(batch.expiryDate)
                                          : undefined
                                      }
                                      onSelect={(date) => handleDateSelect(selectedSubProductId, batchIndex, date)}
                                      initialFocus
                                      captionLayout='dropdown'
                                      fromYear={new Date().getFullYear()}
                                      toYear={new Date().getFullYear() + 20}
                                      className='rounded-md border shadow-sm'
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>

                              <div className='space-y-2'>
                                <Label htmlFor={`price-${selectedSubProductId}-${batchIndex}`}>
                                  Purchase Price *
                                </Label>
                                <Input
                                  type='number'
                                  id={`price-${selectedSubProductId}-${batchIndex}`}
                                  min='0'
                                  step='0.01'
                                  value={batch.price ?? ''}
                                  onChange={(e) =>
                                    handleBatchChange(
                                      selectedSubProductId,
                                      batchIndex,
                                      'price',
                                      e.target.value ? Number(e.target.value) : undefined
                                    )
                                  }
                                  required
                                />
                              </div>

                              <div className='space-y-2'>
                                <Label htmlFor={`stock-${selectedSubProductId}-${batchIndex}`}>Initial Stock *</Label>
                                <Input
                                  type='number'
                                  id={`stock-${selectedSubProductId}-${batchIndex}`}
                                  min='0'
                                  value={batch.stock ?? ''}
                                  onChange={(e) =>
                                    handleBatchChange(
                                      selectedSubProductId,
                                      batchIndex,
                                      'stock',
                                      e.target.value ? Number(e.target.value) : undefined
                                    )
                                  }
                                  required
                                />
                              </div>

                              <div className='space-y-2'>
                                <Label htmlFor={`storeId-${selectedSubProductId}-${batchIndex}`}>Store</Label>
                                <Select
                                  value={batch.storeId || 'none'}
                                  onValueChange={(value) =>
                                    handleBatchChange(selectedSubProductId, batchIndex, 'storeId', value === 'none' ? undefined : value)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder='Select Store' />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {stores.map((store) => (
                                      <SelectItem key={store.id} value={store.id.toString()}>
                                        {store.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {getBatchesForSelectedSubProduct().length > 0 && (
                  <div className='flex justify-end pt-4'>
                    <Button type='submit' disabled={isLoading} size='lg'>
                      {isLoading ? 'Creating...' : `Create ${getBatchesForSelectedSubProduct().length} Batch(es)`}
                    </Button>
                  </div>
                )}
              </form>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductBatchForm;