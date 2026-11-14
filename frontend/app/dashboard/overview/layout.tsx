// Server Component — no 'use client' needed here
import PageContainer from '@/components/layout/page-container';
import { OverviewPermissionShell } from './overview-shell';
import React from 'react';

export default function OverViewLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <OverviewPermissionShell>
      <PageContainer>
        <div className='flex flex-1 flex-col space-y-5 animate-in fade-in duration-300'>
          <div className='flex items-center justify-between border-b pb-2'>
            <div>
              <h2 className='text-2xl font-semibold tracking-tight'>
                Business Overview
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                Revenue, profit, stock and what needs attention
              </p>
            </div>
          </div>
          {children}
        </div>
      </PageContainer>
    </OverviewPermissionShell>
  );
}
