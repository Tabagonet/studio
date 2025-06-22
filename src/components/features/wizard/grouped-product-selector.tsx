
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { SimpleProductSearchResult } from '@/lib/types';
import Image from 'next/image';

interface GroupedProductSelectorProps {
  productIds: number[];
  onProductIdsChange: (ids: number[]) => void;
}

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function GroupedProductSelector({ productIds, onProductIdsChange }: GroupedProductSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableProducts, setAvailableProducts] = useState<SimpleProductSearchResult[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SimpleProductSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const { toast } = useToast();

  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  const fetchProductsByIds = useCallback(async (ids: number[]) => {
      if (ids.length === 0) return [];
      try {
        const user = auth.currentUser;
        if (!user) return [];
        const token = await user.getIdToken();
        const response = await fetch(`/api/woocommerce/search-products?include=${ids.join(',')}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch product details');
        return await response.json();
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load details for selected products.' });
        return [];
      }
  }, [toast]);


  useEffect(() => {
    const syncSelectedProducts = async () => {
        const currentDisplayedIds = new Set(selectedProducts.map(p => p.id));
        const idsToFetch = productIds.filter(id => !currentDisplayedIds.has(id));
        const productsToKeep = selectedProducts.filter(p => productIds.includes(p.id));
        
        if (idsToFetch.length > 0) {
            setIsFetchingDetails(true);
            const newlyFetched = await fetchProductsByIds(idsToFetch);
            setSelectedProducts([...productsToKeep, ...newlyFetched]);
            setIsFetchingDetails(false);
        } else {
             setSelectedProducts(productsToKeep);
        }
    };
    syncSelectedProducts();
  }, [productIds, fetchProductsByIds]);


  // Fetch available products based on search term (now runs on mount)
  useEffect(() => {
    const searchProducts = async () => {
      setIsLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) return; // Wait for user to be available
        const token = await user.getIdToken();
        const response = await fetch(`/api/woocommerce/search-products?q=${encodeURIComponent(debouncedSearchTerm)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to search products');
        const data: SimpleProductSearchResult[] = await response.json();
        setAvailableProducts(data);
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error al buscar productos', description: (error as Error).message });
      } finally {
        setIsLoading(false);
      }
    };
    
    searchProducts();

  }, [debouncedSearchTerm, toast]);

  const handleAddProduct = (product: SimpleProductSearchResult) => {
    if (!productIds.includes(product.id)) {
        onProductIdsChange([...productIds, product.id]);
    }
  };

  const handleRemoveProduct = (productId: number) => {
    onProductIdsChange(productIds.filter(id => id !== productId));
  };
  
  const filteredAvailableProducts = useMemo(() => {
      const selectedIds = new Set(productIds);
      return availableProducts.filter(p => !selectedIds.has(p.id));
  }, [availableProducts, productIds]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Available Products Column */}
      <div className="flex flex-col">
        <h4 className="font-semibold mb-2">Productos Simples Disponibles</h4>
        <div className="flex-grow flex flex-col h-80 rounded-md border">
          <div className="p-2 border-b">
            <Input
              placeholder="Buscar para filtrar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ScrollArea className="flex-grow p-2">
            {isLoading && <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {!isLoading && filteredAvailableProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{debouncedSearchTerm ? 'No se encontraron productos.' : 'No hay productos simples disponibles.'}</p>}
            <div className="space-y-2">
              {filteredAvailableProducts.map(product => (
                <div key={product.id} className="flex items-center justify-between p-2 rounded-md border">
                  <div className="flex items-center gap-2 overflow-hidden">
                      <Image src={product.image || 'https://placehold.co/40x40.png'} alt={product.name} width={40} height={40} className="rounded-sm object-cover" />
                      <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.price}€</p>
                      </div>
                  </div>
                  <Button size="icon-sm" variant="outline" onClick={() => handleAddProduct(product)}><PlusCircle className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Selected Products Column */}
      <div className="flex flex-col">
        <h4 className="font-semibold mb-2">Productos en el Grupo ({selectedProducts.length})</h4>
        <div className="flex-grow flex flex-col h-80 rounded-md border">
            <ScrollArea className="h-full w-full p-2">
            {isFetchingDetails && <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {!isFetchingDetails && selectedProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Añade productos desde la lista de disponibles.</p>}
            <div className="space-y-2">
                {selectedProducts.map(product => (
                <div key={product.id} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                    <div className="flex items-center gap-2 overflow-hidden">
                         <Image src={product.image || 'https://placehold.co/40x40.png'} alt={product.name} width={40} height={40} className="rounded-sm object-cover" />
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium truncate">{product.name}</p>
                        </div>
                    </div>
                    <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleRemoveProduct(product.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                ))}
            </div>
            </ScrollArea>
        </div>
      </div>
    </div>
  );
}
