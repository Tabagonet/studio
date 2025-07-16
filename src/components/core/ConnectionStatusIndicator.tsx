
// src/components/core/ConnectionStatusIndicator.tsx
"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Globe, AlertCircle, RefreshCw, Store, PlugZap, CheckCircle, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { ShopifyIcon } from './icons';

interface ConfigStatus {
    activeStoreUrl: string | null;
    wooCommerceConfigured: boolean;
    wordPressConfigured: boolean;
    shopifyConfigured: boolean;
    shopifyPartnerConfigured?: boolean;
    shopifyPartnerError?: string;
    shopifyCustomAppConfigured?: boolean;
    pluginActive: boolean;
    pluginError?: string;
    activePlatform: 'woocommerce' | 'shopify' | null;
    assignedPlatform: 'woocommerce' | 'shopify' | null;
}

interface ConnectionStatusIndicatorProps {
    status: ConfigStatus | null;
    isLoading: boolean;
    onRefresh: () => void;
    platformToShow?: 'all' | 'woocommerce' | 'shopify' | 'shopify_partner';
}


function getHostname(url: string | null): string | null {
    if (!url) return null;
    try {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const parsedUrl = new URL(fullUrl);
        return parsedUrl.hostname.replace(/^www\./, '');
    } catch (e) {
        return url;
    }
}

export const ConnectionStatusIndicator = ({ status, isLoading, onRefresh, platformToShow = 'all' }: ConnectionStatusIndicatorProps) => {
  if (isLoading) {
    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border p-3 rounded-md bg-muted/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexión...
        </div>
    );
  }

  const hostname = getHostname(status?.activeStoreUrl || null);
  const wpActive = !!status?.wordPressConfigured;
  const wooActive = !!status?.wooCommerceConfigured;
  
  const isPluginVerifiedAndActive = wpActive && !!status?.pluginActive;

  const showWooCommerce = platformToShow === 'all' || platformToShow === 'woocommerce';
  const showShopify = platformToShow === 'all' || platformToShow === 'shopify';
  const showShopifyPartner = platformToShow === 'all' || platformToShow === 'shopify_partner';

  // Specific state for the Shopify Partner card
  if (platformToShow === 'shopify_partner') {
     const isPartnerConnected = !!status?.shopifyPartnerConfigured;
     const partnerError = status?.shopifyPartnerError;
      return (
          <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm" title={partnerError ? `Error: ${partnerError}` : (isPartnerConnected ? "La conexión con la API de Partner está activa." : "No se pudo verificar la conexión con la API de Partner.")}>
                  {isPartnerConnected ? (
                       <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                       <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={cn(isPartnerConnected ? "text-green-600 font-semibold" : "text-destructive font-semibold")}>
                    {isPartnerConnected ? "Conectado" : (partnerError ? "Error" : "No Conectado")}
                  </span>
              </div>
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={isLoading}><RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} /></Button>
              </TooltipTrigger><TooltipContent><p>Refrescar Estado</p></TooltipContent></Tooltip></TooltipProvider>
          </div>
      );
  }

  if (!status || !status.activeStoreUrl) {
    return (
      <div className="flex items-center gap-2">
         <Link href="/settings/connections" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Configurar conexión">
            <Globe className="h-4 w-4 text-destructive" />
            <span className="hidden md:inline">No conectado</span>
        </Link>
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={isLoading}><RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} /></Button>
        </TooltipTrigger><TooltipContent><p>Refrescar Estado</p></TooltipContent></Tooltip></TooltipProvider>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={100}>
            <Link href="/settings/connections" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Gestionar conexiones">
                <span className="hidden md:inline font-medium">{hostname}</span>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                    {showWooCommerce && status.activePlatform === 'woocommerce' && (
                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger>
                                <Store className={cn("h-4 w-4", wooActive ? "text-green-500" : "text-gray-400")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>WooCommerce: {wooActive ? "Configurado" : "No Configurado"}</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger>
                                <Globe className={cn("h-4 w-4", wpActive ? "text-green-500" : "text-destructive")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>WordPress: {wpActive ? "Conectado" : "No Conectado"}</p>
                                </TooltipContent>
                            </Tooltip>
                             <Tooltip>
                                <TooltipTrigger>
                                <PlugZap className={cn("h-4 w-4", isPluginVerifiedAndActive ? "text-green-500" : "text-destructive")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Plugin: {isPluginVerifiedAndActive ? "Verificado" : (status.pluginError || "No responde")}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                    {showShopify && status.activePlatform === 'shopify' && (
                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger>
                                <ShopifyIcon className={cn("h-4 w-4", status.shopifyConfigured ? "text-green-500" : "text-muted-foreground")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Shopify (App Privada): {status.shopifyConfigured ? "Configurado" : "No Configurado"}</p>
                                </TooltipContent>
                            </Tooltip>
                             <Tooltip>
                                <TooltipTrigger>
                                    <ShopifyIcon className={cn("h-4 w-4", status.shopifyPartnerConfigured ? "text-green-500" : "text-destructive")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Shopify Partner: {status.shopifyPartnerConfigured ? "Conectado" : "No Conectado"}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                </div>
            </Link>
        </TooltipProvider>
         <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={isLoading}><RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} /></Button>
        </TooltipTrigger><TooltipContent><p>Refrescar Estado</p></TooltipContent></Tooltip></TooltipProvider>
    </div>
  );
};
