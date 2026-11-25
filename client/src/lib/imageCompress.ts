// Receipt photos are shrunk in the browser before they're uploaded: at most 1600 px on the long side,
// re-encoded as WebP (or JPEG where WebP isn't supported) at quality 0.8. Re-drawing the image on a
// canvas also drops its EXIF data, including the location a phone may have saved. PDFs aren't touched.

const MAX_SIDE = 1600
const QUALITY = 0.8

export class UnsupportedImageError extends Error {}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new UnsupportedImageError('This browser can’t read that photo'))
    }
    img.src = url
  })
}

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY))

/**
 * A smaller copy of the photo, without its EXIF data. Throws UnsupportedImageError when the browser
 * can't open it (for example a HEIC photo in a browser other than Safari).
 */
export async function compressImage(file: File): Promise<{ blob: Blob; filename: string }> {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new UnsupportedImageError('This browser can’t prepare that photo')
  // White behind transparent PNGs, so they don't turn black as JPEG
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  // WebP where the browser can make it (it says so by returning a WebP), otherwise JPEG
  const webp = await toBlob(canvas, 'image/webp')
  const blob = webp?.type === 'image/webp' ? webp : await toBlob(canvas, 'image/jpeg')
  if (!blob) throw new UnsupportedImageError('This browser can’t prepare that photo')
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const base = file.name.replace(/\.[^.]+$/, '') || 'receipt'
  return { blob, filename: `${base}.${ext}` }
}
