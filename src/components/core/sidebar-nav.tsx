
      
// src/components/core/sidebar-nav.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
import { Skeleton } from '../ui/skeleton';
import { version } from '../../../package.json';

interface UserData {
  role: string | null;
  platform?: 'woocommerce' | 'shopify' | null;
  companyId?: string | null;
  companyPlan?: 'lite' | 'pro' | 'agency' | null;
  plan?: 'lite' | 'pro' | 'agency' | null;
  companyPlatform?: 'woocommerce' | 'shopify' | null;
}


interface ConfigStatus {
  wooCommerceConfigured: boolean;
  wordPressConfigured: boolean;
  shopifyConfigured: boolean;
  shopifyPartnerConfigured: boolean;
  pluginActive: boolean;
}

interface Plan {
    id: 'lite' | 'pro' | 'agency';
    name: string;
    price: string;
    features: Record<string, boolean>; // href -> isEnabled
}

export function SidebarNav() {
  const pathname = usePathname();
  const { toast } = useToast();
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [planConfig, setPlanConfig] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserAndConfigData = useCallback(async (user: FirebaseUser) => {
    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      
      const [userResponse, configResponse, plansResponse] = await Promise.all([
        fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/check-config', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/settings/plans', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      if (userResponse.ok) setUserData(await userResponse.json()); else setUserData(null);
      if (configResponse.ok) setConfigStatus(await configResponse.json()); else setConfigStatus(null);
      if (plansResponse.ok) setPlanConfig((await plansResponse.json()).plans); else setPlanConfig([]);

    } catch (error) {
      console.error("Failed to fetch user/config for sidebar", error);
      setUserData(null);
      setConfigStatus(null);
      setPlanConfig([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (user) {
        fetchUserAndConfigData(user);
      } else {
        setUserData(null);
        setConfigStatus(null);
        setPlanConfig([]);
        setIsLoading(false);
      }
    });

    const handleConnectionsUpdate = () => {
        if (auth.currentUser) {
           fetchUserAndConfigData(auth.currentUser);
        }
    };
    window.addEventListener('connections-updated', handleConnectionsUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener('connections-updated', handleConnectionsUpdate);
    };
  }, [fetchUserAndConfigData]);

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
  
  const isItemVisible = (item: any) => {
    if (userData?.role === 'super_admin') {
      return true;
    }
    const hasRequiredRole = !item.requiredRoles || (userData?.role && item.requiredRoles.includes(userData.role));
    if (!hasRequiredRole) return false;

    if (!item.requiredPlan) {
      return true;
    }

    const effectivePlanId = userData?.companyPlan || userData?.plan;
    if (!effectivePlanId) return false;

    const plan = planConfig.find(p => p.id === effectivePlanId);
    return plan?.features[item.href] ?? false;
  };
  
  const renderNavItems = () => {
    if (isLoading) {
      return (
        <>
          <SidebarGroup>
            <Skeleton className="h-5 w-20 mb-2" />
            <Skeleton className="h-8 w-full mb-1" />
            <Skeleton className="h-8 w-full" />
          </SidebarGroup>
          <SidebarGroup>
            <Skeleton className="h-5 w-24 mb-2" />
            <Skeleton className="h-8 w-full mb-1" />
            <Skeleton className="h-8 w-full mb-1" />
            <Skeleton className="h-8 w-full" />
          </SidebarGroup>
        </>
      )
    }

    return NAV_GROUPS.map((group) => {
      const effectivePlatform = userData?.companyPlatform || userData?.platform;
      
      const isGroupVisible = !group.requiredPlatform || 
                              userData?.role === 'super_admin' || 
                              (effectivePlatform && group.requiredPlatform === effectivePlatform);

      if (!isGroupVisible) {
          return null;
      }

      const visibleItems = group.items.filter(item => isItemVisible(item));
      if (visibleItems.length === 0) return null;

      return (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          {visibleItems.map((item) => {
            let isDisabled = !!item.disabled;
            let tooltipText = item.title;
            
            if (group.requiredPlatform === 'woocommerce') {
                const isWpVerified = configStatus?.wordPressConfigured && configStatus.pluginActive;
                const isWooConfigured = configStatus?.wooCommerceConfigured;
                
                const requiresStore = item.href.includes('/wizard') || item.href.includes('/batch');
                
                if (!isWpVerified) {
                  isDisabled = true;
                  tooltipText = "Requiere una conexión a WordPress configurada y verificada.";
                } else if (requiresStore && !isWooConfigured) {
                   isDisabled = true;
                   tooltipText = "Esta función requiere que WooCommerce esté configurado en la conexión activa.";
                }
            }

            if (group.requiredPlatform === 'shopify') {
                if (!configStatus?.shopifyPartnerConfigured) {
                   isDisabled = true;
                   tooltipText = "Requiere una conexión a Shopify Partner activa.";
                }
            }

            return (
              <SidebarMenuItem key={item.href}>
                <Link
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  className={cn(isDisabled && "pointer-events-none")}
                  aria-disabled={isDisabled}
                  tabIndex={isDisabled ? -1 : undefined}
                  onClick={(e) => { if (isDisabled) e.preventDefault(); }}
                >
                  <SidebarMenuButton
                    className={cn(
                      "w-full justify-start",
                      !item.external && pathname === item.href && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                    disabled={isDisabled}
                    tooltip={{ children: tooltipText, className: "bg-card text-card-foreground border-border"}}
                  >
                    <item.icon className="mr-2 h-4 w-4" /> 
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                      {item.title}
                    </span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarGroup>
      );
    });
  }


  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
        <Package className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-sidebar-foreground leading-tight">{APP_NAME}</h1>
          <div className="text-xs text-sidebar-foreground/60 font-mono">v{version}</div>
        </div>
      </div>
      <SidebarMenu className="flex-1 p-0 overflow-y-auto">
        {renderNavItems()}
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
