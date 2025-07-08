// This file is intentionally modified to resolve a build conflict.
// The correct page is located at /src/app/(app)/settings/connections/page.tsx
// Exporting a non-component value as default prevents Next.js from treating this as a page.
const conflictResolver = {
  message: 'This module is not a page component.'
};

export default conflictResolver;
