import { supabase } from './supabaseClient';

export const storageService = {
  /**
   * Upload a file to Supabase Storage
   * @param bucket - The storage bucket name
   * @param path - The file path in the bucket (e.g., 'documents/file.pdf')
   * @param file - The File object to upload
   * @returns The public URL of the uploaded file
   */
  uploadFile: async (bucket: string, path: string, file: File): Promise<string | null> => {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return null;
    }

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        console.error('Error uploading file:', error);
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      return publicUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      return null;
    }
  },

  /**
   * Download a file from Supabase Storage
   * @param bucket - The storage bucket name
   * @param path - The file path in the bucket
   * @returns The file blob
   */
  downloadFile: async (bucket: string, path: string): Promise<Blob | null> => {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return null;
    }

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path);

      if (error) {
        console.error('Error downloading file:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Download failed:', error);
      return null;
    }
  },

  /**
   * Delete a file from Supabase Storage
   * @param bucket - The storage bucket name
   * @param path - The file path in the bucket
   */
  deleteFile: async (bucket: string, path: string): Promise<boolean> => {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return false;
    }

    try {
      const { error } = await supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        console.error('Error deleting file:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Delete failed:', error);
      return false;
    }
  },

  /**
   * List files in a bucket directory
   * @param bucket - The storage bucket name
   * @param path - The directory path (optional)
   */
  listFiles: async (bucket: string, path: string = ''): Promise<any[]> => {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return [];
    }

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(path, {
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) {
        console.error('Error listing files:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('List failed:', error);
      return [];
    }
  },

  /**
   * Get public URL for a file
   * @param bucket - The storage bucket name
   * @param path - The file path in the bucket
   */
  getPublicUrl: (bucket: string, path: string): string | null => {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return publicUrl;
  }
};
