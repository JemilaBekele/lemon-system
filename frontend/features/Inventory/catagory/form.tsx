/* eslint-disable @next/next/no-img-element */
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

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
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { ICategory } from '@/models/Category';
import { createCategory, updateCategory } from '@/service/Category';

// Updated schema to include File for image upload
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const formSchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  image: z
    .instanceof(File)
    .optional()
    .refine((file) => {
      if (!file) return true; // Image is optional
      return file.size <= MAX_FILE_SIZE;
    }, 'File size must be less than 5MB')
    .refine((file) => {
      if (!file) return true; // Image is optional
      return ACCEPTED_IMAGE_TYPES.includes(file.type);
    }, 'Only .jpg, .jpeg, .png and .webp formats are supported'),
  isActive: z.boolean().optional()
});

interface CategoryFormProps {
  initialData: ICategory | null;
  closeModal: () => void;
  isEdit?: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5050';

export const normalizeImagePath = (path?: string) => {
  if (!path) return undefined;
  const normalizedPath = path.replace(/\\/g, '/');
  if (normalizedPath.startsWith('http')) {
    return normalizedPath;
  }
  // Remove any leading slashes to prevent double slashes in URL
  const cleanPath = normalizedPath.replace(/^\/+/, '');
  return `${BACKEND_URL}/${cleanPath}`;
};

export default function CategoryForm({
  initialData,
  closeModal,
  isEdit = false
}: CategoryFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const router = useRouter();

  // Initialize existing image when initialData changes
  useEffect(() => {
    if (initialData?.image) {
      const normalizedImage = normalizeImagePath(initialData.image);
      setExistingImage(normalizedImage || null);
    } else {
      setExistingImage(null);
    }
  }, [initialData]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      image: undefined, // Don't set file as default value
      isActive: initialData?.isActive ?? true
    }
  });

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setPreviewImage(previewUrl);
      
      // Set the form value
      form.setValue('image', file, { shouldValidate: true });
    }
  };

  // Clear image selection
  const handleClearImage = () => {
    // Clean up object URL to prevent memory leaks
    if (previewImage) {
      URL.revokeObjectURL(previewImage);
    }
    setPreviewImage(null);
    form.setValue('image', undefined, { shouldValidate: false });
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewImage) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('isActive', String(data.isActive ?? true));
      
      if (data.image) {
        formData.append('image', data.image);
      }

      if (isEdit && initialData?.id) {
        await updateCategory(initialData.id, formData);
        toast.success('Category updated successfully');
      } else {
        await createCategory(formData);
        toast.success('Category created successfully');
      }

      router.refresh();
      closeModal();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('An error occurred during saving.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className='mx-auto w-full max-w-2xl'>
      <CardHeader>
        <CardTitle className='text-left text-2xl font-bold'>
          {isEdit ? 'Edit Category' : 'Create Category'}
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
                    <Input placeholder='e.g., Electronics' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Image Upload */}
            <FormItem>
              <FormLabel>Category Image</FormLabel>
              <FormControl>
                <div className='space-y-4'>
                  {/* Image Preview */}
               {/* Temporarily use img tag for debugging */}
{(previewImage || existingImage) && (
  <div className='relative w-40 h-40 border rounded-md overflow-hidden'>
    {/* <Image
      src={previewImage || existingImage || ''}
      alt='Category preview'
      fill
      className='object-cover'
      sizes='160px'
    /> */}
    <img
      src={previewImage || existingImage || ''}
      alt='Category preview'
      className='w-full h-full object-cover'
      onError={(e) => {
        console.error('Image failed to load:', e.currentTarget.src);
        e.currentTarget.style.display = 'none';
      }}
    />
    {previewImage && (
      <Button
        type='button'
        variant='destructive'
        size='sm'
        className='absolute top-2 right-2'
        onClick={handleClearImage}
      >
        Remove
      </Button>
    )}
  </div>
)}

                  {/* File Input */}
                  <Input
                    type='file'
                    accept='image/jpeg,image/jpg,image/png,image/webp'
                    onChange={handleFileChange}
                    className='cursor-pointer'
                  />
                  
              

                
                </div>
              </FormControl>
              {form.formState.errors.image && (
                <FormMessage>{form.formState.errors.image.message}</FormMessage>
              )}
            </FormItem>

            {/* Active */}
            <FormField
              control={form.control}
              name='isActive'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center space-x-3 space-y-0'>
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel>Active</FormLabel>
                </FormItem>
              )}
            />

            <div className='flex justify-end gap-2'>
              <Button variant='outline' type='button' onClick={closeModal}>
                Cancel
              </Button>
              <Button type='submit' disabled={isLoading}>
                {isLoading 
                  ? 'Saving...' 
                  : isEdit 
                    ? 'Update Category' 
                    : 'Create Category'
                }
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}