# Security Policy

## Zero-Server Processing & Privacy Guarantee

**Racik — Image Tools** is designed with privacy as the core architecture principle:
- **100% Client-Side:** All image processing (compression, conversion, cropping, censoring, background removal, upscaling, etc.) runs entirely inside your browser using WebAssembly, Web Workers and WebGPU.
- **Zero Image Transmission:** No images, metadata or settings are ever uploaded to a remote server. The only network requests are for the app's static files and, on first use, the AI model weights and runtime files, which are downloaded and cached locally.
- **Offline Capable:** Once installed or visited, the app keeps working without a network connection.

## Reporting a Security Concern

If you discover a security vulnerability, issue, or unintended network leak within this project, please report it responsibly:

1. **GitHub Security Advisory:** You can submit a private vulnerability report via [GitHub Security Advisories](https://github.com/rizalahmaddd/img-tools/security/advisories/new).
2. **Direct Contact:** You can also contact the maintainer directly via WhatsApp at [+62 857-7777-5477](https://wa.me/6285777775477).

Please provide:
- A description of the issue.
- Steps or a proof-of-concept to reproduce the behavior.
- Browser name and version used.

We will review reports promptly and take necessary corrective actions.
