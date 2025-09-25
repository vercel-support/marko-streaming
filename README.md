# Thanks for checking out Marko

# Installation

```
npm init marko -- --template basic-tags
cd marko-app
npm install
npm run dev
```

## Overview

This project is powered by [@marko/run](https://github.com/marko-js/run).

- Run `npm run dev` to start the development server
- Run `npm run build` to build a production-ready node.js server
- Run `npm run preview` to run the production server

## Adding Pages

Pages map to the directory structure. You can add additional pages by creating files/directories under `src/routes` with `+page.marko` files. Learn more in the [`@marko/run` docs](https://github.com/marko-js/run/#file-based-routing).

## Features

- 🏠 **Main Route**: Welcome page with navigation
- 🚀 **Streaming Route**: Real-time Server-Sent Events at `/stream`
- 💅 **Modern UI**: Beautiful, responsive design with animations
- ⚡ **File-based Routing**: Automatic route generation
- 🎯 **Interactive Components**: Mouse tracking, real-time updates

## Deployment

This project is configured for easy deployment to Vercel:

```bash
# Deploy to Vercel
npm install -g vercel
vercel

# Or connect your GitHub repo to Vercel for automatic deployments
```

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for detailed deployment instructions.

## Requirements

- Node.js 20.19.0+ or 22.12.0+ (for full compatibility)
- pnpm (recommended) or npm
