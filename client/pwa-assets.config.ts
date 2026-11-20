// App icons for the PWA, made from public/favicon.svg. Regenerate with: npm run generate-pwa-assets
// The PNGs are committed, so the build doesn't need to run this.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

const background = '#f8f6f1' // warm off-white, the app's light background

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Maskable icons get cropped to a circle or squircle, so the sprout sits inside a padded safe zone
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background } },
  },
  images: ['public/favicon.svg'],
})
