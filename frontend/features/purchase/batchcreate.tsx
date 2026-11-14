'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { IProduct, ISubProduct } from '@/models/Product';
import { createProductBatchSingle, getProducts, getSubProductsByProductId } from '@/service/Product';

const formSchema = z.object({
  batchNumber: z.string().min(1, {
    message: 'Batch number is required'
  }),
  expiryDate: z.string().optional(),
  productId: z.string().min(1, {
    message: 'Product is required'
  }),
  subProductId: z.string().optional() // Added subProductId field
});

interface CreateProductBatchModalProps {
  closeModal: () => void;
  initialProductId?: string;
  initialSubProductId?: string; // Added initialSubProductId prop
  // Receives the batch just created
  onSuccess?: (batch?: { id: string | number; productId?: string; subProductId?: string | null }) => void;
}

export interface IProductBatch {
  id: number;
  batchNumber: string;
  expiryDate?: string;
  productId: string;
  subProductId?: string; // Added subProductId to interface
}

export default function CreateProductBatchModal({
  closeModal,
  initialProductId,
  initialSubProductId, // Added prop
  onSuccess
}: CreateProductBatchModalProps) {
  const router = useRouter();
  const [products, setProducts] = useState<IProduct[]>([]);
  const [subProducts, setSubProducts] = useState<ISubProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSubProducts, setLoadingSubProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch products on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingProducts(true);
        const productsData = await getProducts();
        setProducts(productsData || []);
      } catch  {
        toast.error('Failed to load products');
        setProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchData();
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      batchNumber: '',
      expiryDate: '',
      productId: initialProductId || '',
      subProductId: initialSubProductId || '' // Added initial value
    }
  });

  // Fetch subproducts when product changes
  useEffect(() => {
    const fetchSubProducts = async () => {
      const productId = form.getValues('productId');
      if (productId) {
        try {
          setLoadingSubProducts(true);
          const subProductsData = await getSubProductsByProductId(productId);
          setSubProducts(subProductsData || []);
        } catch  {
          toast.error('Failed to load subproducts');
          setSubProducts([]);
        } finally {
          setLoadingSubProducts(false);
        }
      } else {
        setSubProducts([]);
      }
    };

    fetchSubProducts();
  }, [form]);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      setSubmitting(true);

      // Validate required fields
      if (!data.batchNumber || !data.productId) {
        toast.error('Please fill all required fields');
        return;
      }

      // Prepare payload
      const payload = {
        ...data,
        // Remove subProductId if it's an empty string
        subProductId: data.subProductId?.trim() ? data.subProductId : undefined
      };

      const response = await createProductBatchSingle(payload);

      toast.success('Product batch created successfully');
      closeModal();
      onSuccess?.(response?.data);
      router.refresh();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Error creating product batch';
      toast.error(backendMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className='mx-auto w-full max-w-md'>
      <CardHeader>
        <CardTitle className='text-left text-2xl font-bold'>
          Create Product Batch
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='productId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product *</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Clear subproduct when product changes
                      form.setValue('subProductId', '');
                    }}
                    value={field.value}
                    disabled={loadingProducts || !!initialProductId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select product' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem
                          key={product.id}
                          value={product.id?.toString() || 'unknown'}
                        >
                          {product.name} ({product.productCode || 'No code'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='subProductId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subproduct (Optional)</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loadingSubProducts || !form.getValues('productId')}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !form.getValues('productId') 
                            ? 'Select product first' 
                            : loadingSubProducts 
                            ? 'Loading subproducts...' 
                            : 'Select subproduct (optional)'
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subProducts.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No subproducts available
                        </div>
                      ) : (
                        <>
                          {subProducts.map((subProduct) => (
                            <SelectItem
                              key={subProduct.id}
                              value={subProduct.id?.toString() || 'unknown'}
                            >
                              {subProduct.name}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='batchNumber'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Batch Number *</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter batch number' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='expiryDate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiry Date (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type='date'
                      placeholder='Select expiry date'
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='flex justify-end gap-2 pt-4'>
              <Button variant='outline' type='button' onClick={closeModal}>
                Cancel
              </Button>
              <Button type='submit' disabled={loadingProducts || submitting}>
                {submitting ? 'Creating...' : 'Create Batch'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}