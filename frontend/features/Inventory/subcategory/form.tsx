/* eslint-disable @next/next/no-img-element */
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { ISubCategory, ICategory } from '@/models/Category';
import {
  createSubCategory,
  updateSubCategory,
  getCategories
} from '@/service/Category';

/* ---------------- VALIDATION ---------------- */

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const formSchema = z.object({
  name: z.string().min(1, 'Subcategory name is required'),
  categoryId: z.string({ required_error: 'Category is required' }),
  image: z
    .instanceof(File)
    .optional()
    .refine(file => !file || file.size <= MAX_FILE_SIZE, 'Max size is 5MB')
    .refine(
      file => !file || ACCEPTED_IMAGE_TYPES.includes(file.type),
      'Only jpg, png, webp allowed'
    ),
  isActive: z.boolean().optional()
});

interface SubCategoryFormProps {
  initialData: ISubCategory | null;
  closeModal: () => void;
  isEdit?: boolean;
}

const BACKEND_URL = 'http://localhost:5000';

const normalizeImagePath = (path?: string) => {
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('http')) return normalized;
  return `${BACKEND_URL}/${normalized.replace(/^\/+/, '')}`;
};

/* ---------------- COMPONENT ---------------- */

export default function SubCategoryForm({
  initialData,
  closeModal,
  isEdit = false
}: SubCategoryFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);

  const router = useRouter();

  /* Load categories */
  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => toast.error('Failed to fetch categories'));
  }, []);

  /* Existing image */
  useEffect(() => {
    if (initialData?.image) {
      setExistingImage(normalizeImagePath(initialData.image) || null);
    }
  }, [initialData]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      categoryId: initialData?.categoryId || '',
      image: undefined,
      isActive: initialData?.isActive ?? true
    }
  });

  /* Default category */
  useEffect(() => {
    if (!initialData && categories.length > 0) {
      form.setValue('categoryId', categories[0].id);
    }
  }, [categories, initialData, form]);

  /* Image handling */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);
    setPreviewImage(preview);
    form.setValue('image', file, { shouldValidate: true });
  };

  const clearImage = () => {
    if (previewImage) URL.revokeObjectURL(previewImage);
    setPreviewImage(null);
    form.setValue('image', undefined);
  };

  /* Submit */
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('categoryId', data.categoryId);
      formData.append('isActive', String(data.isActive ?? true));
      if (data.image) formData.append('image', data.image);

      if (isEdit && initialData?.id) {
        await updateSubCategory(initialData.id, formData);
        toast.success('Subcategory updated');
      } else {
        await createSubCategory(formData);
        toast.success('Subcategory created');
      }

      router.refresh();
      closeModal();
    } catch {
      toast.error('Failed to save subcategory');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className='mx-auto w-full max-w-2xl'>
      <CardHeader>
        <CardTitle className='text-2xl font-bold'>
          {isEdit ? 'Edit Subcategory' : 'Create Subcategory'}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            {/* Name */}
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. Smartphones' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name='categoryId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder='Select category' />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Image */}
            <FormItem>
              <FormLabel>Subcategory Image</FormLabel>
              {(previewImage || existingImage) && (
                <div className='relative w-40 h-40 border rounded overflow-hidden'>
                  <img
                    src={previewImage || existingImage || ''}
                    className='w-full h-full object-cover'
                    alt='preview'
                  />
                  {previewImage && (
                    <Button
                      type='button'
                      variant='destructive'
                      size='sm'
                      className='absolute top-2 right-2'
                      onClick={clearImage}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              )}
              <Input
                type='file'
                accept='image/*'
                onChange={handleFileChange}
              />
              <FormMessage />
            </FormItem>

            {/* Active */}
            <FormField
              control={form.control}
              name='isActive'
              render={({ field }) => (
                <FormItem className='flex items-center space-x-3'>
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel>Active</FormLabel>
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className='flex justify-end gap-2'>
              <Button variant='outline' type='button' onClick={closeModal}>
                Cancel
              </Button>
              <Button type='submit' disabled={isLoading}>
                {isEdit ? 'Update Subcategory' : 'Create Subcategory'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
