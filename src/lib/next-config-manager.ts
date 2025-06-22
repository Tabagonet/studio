// src/lib/next-config-manager.ts
'use server';

import { promises as fs } from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'next.config.js');

/**
 * Adds a new hostname to the remotePatterns array in next.config.js.
 * This function is designed to be idempotent and will not add duplicate entries.
 * It reads the config file, injects the new pattern if it doesn't exist, and writes it back.
 * NOTE: A server restart is required for the changes to take effect in a local development environment.
 * @param {string} hostname - The hostname to add (e.g., 'newstore.com').
 */
export async function addRemotePattern(hostname: string): Promise<void> {
  if (!hostname || typeof hostname !== 'string') {
    console.warn('addRemotePattern: Invalid or empty hostname provided. Skipping.');
    return;
  }

  try {
    let content = await fs.readFile(configPath, 'utf-8');

    // Use a specific regex to avoid matching substrings in comments or other parts of the file
    const existingPatternRegex = new RegExp(`hostname:\\s*['"]${hostname.replace(/\./g, '\\.')}['"]`);
    if (existingPatternRegex.test(content)) {
      console.log(`Hostname '${hostname}' already exists in next.config.js. Skipping.`);
      return;
    }

    const newPatternString = `      {
        protocol: 'https',
        hostname: '${hostname}',
      },`;

    const remotePatternsRegex = /(remotePatterns:\s*\[)/;
    const match = content.match(remotePatternsRegex);

    if (match && match.index !== undefined) {
      const insertionIndex = match.index + match[0].length;
      const newContent = `${content.slice(0, insertionIndex)}\n${newPatternString}${content.slice(insertionIndex)}`;
      
      await fs.writeFile(configPath, newContent, 'utf-8');
      console.log(`Successfully added hostname '${hostname}' to next.config.js. A server restart is required for changes to take effect.`);
    } else {
      console.error('addRemotePattern: Could not find `remotePatterns: [` array in next.config.js. File was not modified.');
    }
  } catch (error) {
    console.error(`addRemotePattern: Failed to read or write to next.config.js. Error:`, error);
    // We don't re-throw the error to avoid failing the entire API request.
    // The primary function (saving to DB) should still succeed.
  }
}
