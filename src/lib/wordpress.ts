
// src/lib/wordpress.ts
import axios from 'axios';

const wordpressApiUrl = process.env.WORDPRESS_API_URL; // e.g., https://yourdomain.com
const username = process.env.WORDPRESS_USERNAME;
const applicationPassword = process.env.WORDPRESS_APPLICATION_PASSWORD;

let wpApi: any = null;

if (wordpressApiUrl && username && applicationPassword) {
  try {
    const token = Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64');
    
    wpApi = axios.create({
      baseURL: `${wordpressApiUrl}/wp-json/wp/v2`,
      headers: {
        'Authorization': `Basic ${token}`,
      },
    });
    console.log("WordPress API client initialized successfully.");
  } catch (error) {
     console.error("Error initializing WordPress API client:", error);
  }
} else {
  console.warn(
    "WordPress API environment variables (WORDPRESS_API_URL, WORDPRESS_USERNAME, WORDPRESS_APPLICATION_PASSWORD) are not fully set. WordPress API client not initialized."
  );
}

export { wpApi };
