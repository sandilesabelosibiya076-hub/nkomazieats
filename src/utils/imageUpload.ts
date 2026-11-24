/**
 * Compresses an uploaded image File into a crisp JPEG data URL
 * safely under 180KB so it fits inside Firestore document size limits.
 */
export async function compressImageFile(file: File, maxWidth = 900, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose a valid image file (JPG, PNG, or WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetW = Math.round(img.width * scale);
        const targetH = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser canvas unavailable for image processing.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let result = canvas.toDataURL('image/jpeg', quality);
        if (result.length > 220000) {
          result = canvas.toDataURL('image/jpeg', 0.58);
        }
        if (result.length > 240000) {
          reject(new Error('Image is still too large after compression. Try a smaller photo.'));
          return;
        }
        resolve(result);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
