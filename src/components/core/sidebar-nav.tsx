
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
import { Package, LogOut } from "lucide-react"; 
import { auth, firebaseSignOut } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function SidebarNav() {
  const pathname = usePathname();
  const { toast } = useToast();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
      toast({
        title: "Sesión Cerrada",
        description: "Has cerrado sesión exitosamente.",
      });
      router.push('/login');
    } catch (error: any) {
      console.error("Error signing out from sidebar:", error);
      toast({
        title: "Error al Cerrar Sesión",
        description: error.message || "No se pudo cerrar la sesión.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-6 border-b border-sidebar-border">
        <Package className="h-8 w-8 text-primary" />
        <h1 className="text-xl font-semibold text-sidebar-foreground">{APP_NAME}</h1>
      </div>
      <SidebarMenu className="flex-1 p-4 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <SidebarMenuItem key={item.title}>
            <Link href={item.href} passHref legacyBehavior={item.external ? undefined : true}>
              <SidebarMenuButton
                asChild={false} 
                className={cn(
                  "w-full justify-start",
                  pathname === item.href && "bg-sidebar-accent text-sidebar-accent-foreground",
                  item.disabled && "cursor-not-allowed opacity-80"
                )}
                aria-disabled={item.disabled}
                // disabled={item.disabled} // Cannot apply to button if Link is parent and asChild is false
                tooltip={{ children: item.title, className: "bg-card text-card-foreground border-border"}}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
              >
                <div>
                  <item.icon className="mr-2 h-5 w-5" />
                  <span className="truncate group-data-[collapsible=icon]:hidden">
                    {item.title}
                  </span>
                </div>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <SidebarMenuItem>
            <SidebarMenuButton
                onClick={handleSignOut}
                className="w-full justify-start hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/20 focus:text-destructive"
                tooltip={{ children: "Cerrar Sesión", className: "bg-card text-card-foreground border-border"}}
            >
                <div>
                    <LogOut className="mr-2 h-5 w-5" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                        Cerrar Sesión
                    </span>
                </div>
            </SidebarMenuButton>
        </SidebarMenuItem>
      </div>
    </div>
  );
}
