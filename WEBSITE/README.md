# TinyPDF Studio

A browser-only website for compressing photos, exporting images as PDF/JPG/PNG/WEBP, creating PDFs from images, compressing PDFs, and converting PDF pages to JPG or PNG.

## Open the Website

Open `index.html` in a modern browser.

## Tools Included

- Image Compressor: upload a photo and export it below a target size, defaulting to 100KB.
- Image to PDF: upload one or more photos, edit and arrange each page, and create a readable PDF, with an optional strict size target defaulting to 100KB.
- PDF Compressor: upload a PDF and rebuild pages at a smaller size.
- PDF to Image: upload a PDF and export each page as JPG or PNG.

PDF tools use `pdf.js` and `jsPDF` from a CDN, so they need an internet connection the first time the page loads.

## Image Editing

The Image to PDF builder supports multiple pages, page removal, move up/down, shuffle, crop presets, custom crop inset, left/right rotation, and brightness adjustment per page.

The default Image to PDF save mode prioritizes readable document quality. Use `Strict under target` only when the file absolutely must fit under the size target, because very small limits can make text hard to read.

## Visitor Counter

The visitor counter uses browser storage, so it counts visits on the current browser/device. A public all-user counter needs a hosted database or analytics service.
