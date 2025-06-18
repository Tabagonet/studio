// src/components/core/sidebar-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Package } from "lucide-react";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-6 border-b border-sidebar-border">
        <Package className="h-8 w-8 text-primary" />
        <h1 className="text-xl font-semibold text-sidebar-foreground">{APP_NAME}</h1>
      </div>
      <SidebarMenu className="flex-1 p-4">
        {NAV_ITEMS.map((item) => (
          <SidebarMenuItem key={item.title}>
            <Link href={item.href}>
              <SidebarMenuButton
                asChild
                className={cn(
                  "w-full justify-start",
                  pathname === item.href && "bg-sidebar-accent text-sidebar-accent-foreground",
                  item.disabled && "cursor-not-allowed opacity-80"
                )}
                aria-disabled={item.disabled}
                disabled={item.disabled}
                tooltip={{ children: item.title, className: "bg-card text-card-foreground border-border"}}
              >
                <>
                  <item.icon className="mr-2 h-5 w-5" />
                  <span className="truncate group-data-[collapsible=icon]:hidden">
                    {item.title}
                  </span>
                </>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </div>
  );
}
