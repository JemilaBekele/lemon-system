/* eslint-disable @next/next/no-img-element */
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { CalendarDays, Check, X, Eye } from 'lucide-react';
import { ISubCategory } from '@/models/Category';
import { SubCategoryCellAction } from './cell-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useState } from 'react';

/* ---------------- Image Utils ---------------- */

const BACKEND_URL = 'http://localhost:5000';

export const normalizeImagePath = (path?: string) => {
  if (!path) return null;

  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('http')) return normalized;

  return `${BACKEND_URL}/${normalized.replace(/^\/+/, '')}`;
};

/* ---------------- Image Preview ---------------- */

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



/* ---------------- Columns ---------------- */

export const subCategoryColumns: ColumnDef<ISubCategory>[] = [
  /* Image */
  {
    accessorKey: 'image',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Image" />
    ),
    cell: ({ cell }) => {
      const imagePath = cell.getValue<ISubCategory['image']>();
      const image = normalizeImagePath(imagePath);

      return (
        <div className="flex justify-center">
          {image ? (
            <div className="flex items-center gap-2">
              <div className="relative h-12 w-12 overflow-hidden rounded-md border">
                <Image
                  src={image}
                  alt="SubCategory"
                  fill
                  sizes="48px"
                  className="object-cover"
                  onError={(e) => {
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const img = document.createElement('img');
                      img.src = image;
                      img.className = 'w-full h-full object-cover';
                      parent.innerHTML = '';
                      parent.appendChild(img);
                    }
                  }}
                />
              </div>
              <ImagePreview src={image} alt="SubCategory preview" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded-md border bg-muted flex items-center justify-center">
              <span className="text-xs text-muted-foreground">No image</span>
            </div>
          )}
        </div>
      );
    },
    enableSorting: false
  },

  /* Name */
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="SubCategory Name" />
    ),
    cell: ({ cell }) => (
      <div className="font-medium">
        {cell.getValue<ISubCategory['name']>()}
      </div>
    ),
    enableColumnFilter: true
  },
 {
    accessorKey: 'code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Code' />
    ),
    cell: ({ cell }) => (
      <Badge variant="outline" className="font-mono">
        {cell.getValue<ISubCategory['code']>() || 'N/A'}
      </Badge>
    ),
    enableColumnFilter: true
  },
  /* Category */
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Category" />
    ),
    cell: ({ cell }) => {
      const category = cell.getValue<ISubCategory['category']>();
      return <div>{category?.name ?? '-'}</div>;
    },
    enableColumnFilter: true
  },

  /* Status */
  {
    accessorKey: 'isActive',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ cell }) => {
      const isActive = cell.getValue<ISubCategory['isActive']>();
      return (
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className="flex items-center gap-1"
        >
          {isActive ? (
            <>
              <Check className="h-3 w-3" /> Active
            </>
          ) : (
            <>
              <X className="h-3 w-3" /> Inactive
            </>
          )}
        </Badge>
      );
    },
    enableColumnFilter: true
  },

  /* Created At */
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    cell: ({ cell }) => {
      const date = cell.getValue<ISubCategory['createdAt']>();
      return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          {date ? new Date(date).toLocaleDateString() : '-'}
        </div>
      );
    }
  },

  /* Actions */
  {
    id: 'actions',
    cell: ({ row }) => <SubCategoryCellAction data={row.original} />
  }
];
