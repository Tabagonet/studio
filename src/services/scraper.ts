
'use server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function scrapeUrl(url: string): Promise<string | null> {
    try {
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            },
            timeout: 5000,
        });
        const $ = cheerio.load(data);
        
        $('header, footer, nav, script, style, noscript, .header, .footer').remove();
        
        let mainContent = $('main').text() || $('article').text() || $('body').text();
        
        mainContent = mainContent.replace(/\s\s+/g, ' ').trim();
        
        return mainContent.substring(0, 2000); 
    } catch (error) {
        console.error(`Error scraping URL ${url}:`, error);
        return null;
    }
}
