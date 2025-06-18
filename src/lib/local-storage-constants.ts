
// src/lib/local-storage-constants.ts

// For API endpoint /api/upload-image-local
export const MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL = 5 * 1024 * 1024; // 5MB
// Allow common image types for initial upload, sharp will convert to webp
export const ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
export const LOCAL_UPLOAD_RAW_DIR_RELATIVE = 'user_uploads/raw'; // Relative to /public

// For API endpoint /api/process-photos
// Input for sharp can be varied, output will be webp
export const LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE = 'user_uploads/processed'; // Relative to /public
    
