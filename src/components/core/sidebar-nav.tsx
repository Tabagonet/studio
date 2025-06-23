
// src/components/core/sidebar-nav.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Package, LogOut } from "lucide-react"; 
import { auth, firebaseSignOut, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function SidebarNav() {
  const pathname = usePathname();
  const { toast } = useToast();
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/user/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const userData = await response.json();
            setUserRole(userData.role);
          } else {
            setUserRole(null);
          }
        } catch (error) {
          console.error("Failed to fetch user role for sidebar", error);
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
    });

    return () => unsubscribe();
  }, []);

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
      <SidebarMenu className="flex-1 p-0 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(item => !item.adminOnly || userRole === 'admin');
          if (visibleItems.length === 0) {
            return null;
          }
          return (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    className={cn(item.disabled && "pointer-events-none")}
                  >
                    <SidebarMenuButton
                      className={cn(
                        "w-full justify-start",
                        !item.external && pathname === item.href && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                      disabled={item.disabled}
                      tooltip={{ children: item.title, className: "bg-card text-card-foreground border-border"}}
                    >
                      <item.icon className="mr-2 h-4 w-4" /> 
                      <span className="truncate group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarGroup>
          );
        })}
      </SidebarMenu>
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <SidebarMenuItem>
            <SidebarMenuButton
                onClick={handleSignOut}
                className="w-full justify-start hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/20 focus:text-destructive"
                tooltip={{ children: "Cerrar Sesión", className: "bg-card text-card-foreground border-border"}}
            >
                <LogOut className="mr-2 h-4 w-4" />
                <span className="truncate group-data-[collapsible=icon]:hidden">
                    Cerrar Sesión
                </span>
            </SidebarMenuButton>
        </SidebarMenuItem>
      </div>
    </div>
  );
}
