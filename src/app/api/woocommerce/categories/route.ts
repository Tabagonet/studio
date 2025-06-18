
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { wooApi } from '@/lib/woocommerce';
import type { WooCommerceCategory } from '@/lib/types';

export async function GET(request: NextRequest) {
  if (!wooApi) {
    return NextResponse.json({ error: 'WooCommerce API client not initialized.' }, { status: 500 });
  }

  try {
    const response = await wooApi.get("products/categories", {
      per_page: 100, // Obtener hasta 100 categorías, ajustar si tienes más
      orderby: "name",
      order: "asc",
    });
    
    if (response.status !== 200) {
      console.error("Error fetching WooCommerce categories:", response.data);
      const errorMessage = response.data.message || `WooCommerce API error: ${response.status}`;
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const categories: WooCommerceCategory[] = response.data.map((category: any) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    }));
    
    return NextResponse.json(categories, { status: 200 });

  } catch (error: any) {
    console.error("Error fetching WooCommerce categories:", error);
    const errorMessage = error.response?.data?.message || error.message || "Unknown error fetching categories";
    return NextResponse.json({ error: "Failed to fetch WooCommerce categories.", details: errorMessage }, { status: 500 });
  }
}
