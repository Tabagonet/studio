// src/lib/woocommerce.ts
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const wooCommerceStoreUrl = process.env.WOOCOMMERCE_STORE_URL;
const wooCommerceApiKey = process.env.WOOCOMMERCE_API_KEY;
const wooCommerceApiSecret = process.env.WOOCOMMERCE_API_SECRET;

let wooApi: WooCommerceRestApi | null = null;

if (wooCommerceStoreUrl && wooCommerceApiKey && wooCommerceApiSecret) {
  try {
    wooApi = new WooCommerceRestApi({
      url: wooCommerceStoreUrl,
      consumerKey: wooCommerceApiKey,
      consumerSecret: wooCommerceApiSecret,
      version: "wc/v3",
      queryStringAuth: true 
    });
    console.log("WooCommerce API client initialized successfully.");
  } catch (error) {
    console.error("Error initializing WooCommerce API client:", error);
  }
} else {
  console.warn(
    "WooCommerce environment variables (WOOCOMMERCE_STORE_URL, WOOCOMMERCE_API_KEY, WOOCOMMERCE_API_SECRET) are not fully set. WooCommerce API client not initialized."
  );
}

export { wooApi };
