"use client";

import React from 'react';
import { SidebarProvider, Sidebar, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/core/sidebar-nav";
import { Header } from "@/components/core/header";

interface AppLayoutProps {
  children: React.ReactNode;
  defaultOpen?: boolean; // Add this prop
}

export function AppLayout({ children, defaultOpen = true }: AppLayoutProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
        <SidebarNav />
      </Sidebar>
      <SidebarRail />
      <SidebarInset className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
