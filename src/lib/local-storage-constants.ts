
// src/lib/local-storage-constants.ts

// For API endpoint /api/upload-image-local
export const MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL = 5 * 1024 * 1024; // 5MB
export const ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL = ['image/jpeg', 'image/jpg'];
export const LOCAL_UPLOAD_RAW_DIR_RELATIVE = 'user_uploads/raw'; // Relative to /public

// For API endpoint /api/process-photos (reading local files)
export const MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS = 5 * 1024 * 1024; // 5MB (should match or be slightly larger than upload)
export const ALLOWED_MIME_TYPES_PROCESS_PHOTOS = ['image/jpeg', 'image/jpg']; // Input to sharp
export const LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE = 'user_uploads/processed'; // Relative to /public
    
