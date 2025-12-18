# Assets Folder

This folder contains all static assets for the Payroll-Jam application.

## 📁 Folder Structure

```
public/assets/
├── logos/          # Company logos, branding
├── favicons/       # Favicon files (ico, png, svg)
├── images/         # General images, photos, backgrounds
└── icons/          # Custom icon files (if not using lucide-react)
```

---

## 🎨 Usage Guide

### **Logos** (`/logos`)
Place your company logo files here.

**Recommended formats:**
- `logo.svg` - Primary logo (scalable)
- `logo.png` - PNG version (transparent background)
- `logo-white.svg` - White version for dark backgrounds
- `logo-icon.svg` - Icon/mark only (square format)

**Usage in code:**
```tsx
<img src="/assets/logos/logo.svg" alt="Payroll-Jam Logo" />
```

---

### **Favicons** (`/favicons`)
Place favicon files for browser tabs and mobile home screens.

**Recommended files:**
- `favicon.ico` - 32x32 ICO file
- `favicon-16x16.png` - Small browser tab
- `favicon-32x32.png` - Standard browser tab
- `apple-touch-icon.png` - 180x180 for iOS home screen
- `android-chrome-192x192.png` - Android home screen
- `android-chrome-512x512.png` - Android splash screen

**Add to `index.html` `<head>`:**
```html
<link rel="icon" type="image/x-icon" href="/assets/favicons/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicons/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicons/apple-touch-icon.png">
```

---

### **Images** (`/images`)
General purpose images, photos, illustrations, backgrounds.

**Examples:**
- `hero-background.jpg` - Landing page hero
- `team-photo.jpg` - About page
- `dashboard-preview.png` - Screenshots

**Usage in code:**
```tsx
<img src="/assets/images/hero-background.jpg" alt="Hero" />
// Or as background
style={{ backgroundImage: `url(/assets/images/hero-background.jpg)` }}
```

---

### **Icons** (`/icons`)
Custom icon files (only if not using lucide-react).

**Note:** The app currently uses lucide-react for icons. Only add custom icons here if needed.

**Usage in code:**
```tsx
<img src="/assets/icons/custom-icon.svg" alt="Custom Icon" />
```

---

## 🔗 Public Folder Behavior

Files in `/public` are served at the root path:
- `/public/assets/logos/logo.svg` → `/assets/logos/logo.svg`
- No imports needed, just reference the path directly

---

## 📝 Best Practices

1. **File Naming:**
   - Use lowercase with hyphens: `company-logo.svg`
   - Be descriptive: `dashboard-preview.png` not `img1.png`

2. **Optimization:**
   - Compress images before adding (use TinyPNG, ImageOptim)
   - Use SVG for logos and icons when possible
   - Use WebP format for photos (with JPG fallback)

3. **Organization:**
   - Keep related files together
   - Add subfolders if a category grows (e.g., `/logos/variants/`)

4. **Sizes:**
   - Keep images under 500KB when possible
   - Provide multiple sizes for responsive images

---

## 🚀 Quick Start

1. **Add your logo:**
   - Place `logo.svg` in `/public/assets/logos/`
   - Update references in components (e.g., `Layout.tsx`, `LandingPage.tsx`)

2. **Add favicons:**
   - Generate favicon package: https://realfavicongenerator.net/
   - Extract files to `/public/assets/favicons/`
   - Add links to `index.html`

3. **Add images:**
   - Place files in `/public/assets/images/`
   - Reference as `/assets/images/your-file.jpg`

---

## 🔍 Finding Current Logo Usage

Current logo locations to update:
- Landing page header
- Login/Signup pages
- Employee Portal
- PDF payslips (if using logo)
- Email templates

Search codebase for: `"Payroll-Jam"` text to find where to add logos.

---

**Need help?** Check the Vite docs on static assets: https://vitejs.dev/guide/assets.html
