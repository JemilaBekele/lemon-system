'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { CalendarDays, Check, X, Eye } from 'lucide-react';
import { ICategory } from '@/models/Category';
import { CategoryCellAction } from './cell-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useState } from 'react';

// Image normalization utility
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5050';
export const normalizeImagePath = (path?: string) => {
  if (!path) return null;
  
  const normalizedPath = path.replace(/\\/g, '/');
  
  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
    return normalizedPath;
  }
  
  const cleanPath = normalizedPath.replace(/^\/+/, '');
  return `${BACKEND_URL}/${cleanPath}`;
};

// Image preview dialog component
const ImagePreview = ({ src, alt }: { src: string; alt: string }) => {
  const [open, setOpen] = useState(false);
  if (!src) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Eye className="h-4 w-4" />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setOpen(false)}
        >
          {/* stop close on image click */}
          <div onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-md"
            />
          </div>
        </div>
      )}
    </>
  );
};

export const categoryColumns: ColumnDef<ICategory>[] = [
{
  accessorKey: 'image',
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title='Image' />
  ),
  cell: ({ cell }) => {
    const imagePath = cell.getValue<ICategory['image']>();
    console.log('Original image path:', imagePath); // Debug log
    
    const normalizedImage = normalizeImagePath(imagePath);
    console.log('Normalized image URL:', normalizedImage); // Debug log
    
    // Test if URL is accessible
    if (normalizedImage) {
      fetch(normalizedImage, { method: 'HEAD' })
        .then(res => console.log('Image accessible:', res.ok))
        .catch(err => console.error('Image fetch error:', err));
    }
    
    return (
      <div className="flex items-center justify-center">
        {normalizedImage ? (
          <div className="relative flex items-center gap-2">
            {/* First try with Next.js Image */}
            <div className="relative h-12 w-12 overflow-hidden rounded-md border">
              <Image
                src={normalizedImage}
                alt="Category"
                fill
                className="object-cover"
                sizes="48px"
                onError={(e) => {
                  console.error('Next.js Image failed:', e);
                  // Fallback to img tag
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const img = document.createElement('img');
                    img.src = normalizedImage;
                    img.alt = "Category";
                    img.className = "w-full h-full object-cover";
                    parent.innerHTML = '';
                    parent.appendChild(img);
                  }
                }}
              />
            </div>
            <ImagePreview 
              src={normalizedImage} 
              alt="Category preview" 
            />
          </div>
        ) : (
          <div className="h-12 w-12 rounded-md border bg-muted flex items-center justify-center">
            <span className="text-xs text-muted-foreground">No image</span>
          </div>
        )}
      </div>
    );
  },
  enableColumnFilter: false,
  enableSorting: false
},
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Category Name' />
    ),
    cell: ({ cell }) => <div className="font-medium">{cell.getValue<ICategory['name']>()}</div>,
    enableColumnFilter: true
  },
  {
    accessorKey: 'code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Code' />
    ),
    cell: ({ cell }) => (
      <Badge variant="outline" className="font-mono">
        {cell.getValue<ICategory['code']>() || 'N/A'}
      </Badge>
    ),
    enableColumnFilter: true
  },
  {
    accessorKey: 'isActive',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ cell }) => {
      const isActive = cell.getValue<ICategory['isActive']>();
      return (
        <Badge 
          variant={isActive ? "default" : "secondary"}
          className="flex items-center gap-1"
        >
          {isActive ? (
            <>
              <Check className="h-3 w-3" />
              Active
            </>
          ) : (
            <>
              <X className="h-3 w-3" />
              Inactive
            </>
          )}
        </Badge>
      );
    },
    enableColumnFilter: true,
    filterFn: (row, id, value) => {
      const rowValue = row.getValue(id) as boolean;
      return value === 'all' || (value === 'active' && rowValue) || (value === 'inactive' && !rowValue);
    }
  },
  // {
  //   accessorKey: 'displayOrder',
  //   header: ({ column }) => (
  //     <DataTableColumnHeader column={column} title='Order' />
  //   ),
  //   cell: ({ cell }) => (
  //     <div className="text-center font-medium">
  //       {cell.getValue<ICategory['displayOrder']>() || 0}
  //     </div>
  //   ),
  //   enableColumnFilter: false
  // },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ cell }) => {
      const date = cell.getValue<ICategory['createdAt']>();
      return (
        <div className='text-muted-foreground flex items-center gap-1 text-sm'>
          <CalendarDays className='h-4 w-4' />
          {date ? new Date(date).toLocaleDateString() : '-'}
        </div>
      );
    },
    enableColumnFilter: false
  },
  {
    id: 'actions',
    cell: ({ row }) => <CategoryCellAction data={row.original} />
  }
];