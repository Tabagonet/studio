import { NextResponse } from 'next/server';
import { wooApi } from '@/lib/woocommerce';
import type { WooCommerceCategory } from '@/lib/types';

export async function GET() {
  if (!wooApi) {
    return NextResponse.json({ error: 'WooCommerce API not configured' }, { status: 500 });
  }

  try {
    // Fetch all categories, up to 100. For more, pagination would be needed.
    const response = await wooApi.get("products/categories", { per_page: 100 });
    const categories: WooCommerceCategory[] = response.data
        .filter((cat: any) => cat.name !== 'Uncategorized') // Optionally filter out default category
        .map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
        }));
        
    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Error fetching WooCommerce categories:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch categories from WooCommerce';
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status: error.response?.status || 500 }
    );
  }
}
