# Vercel Deployment Guide

This Marko Run project is configured for deployment to Vercel. Here's how to deploy it:

## Prerequisites

1. **Node.js Version**: Ensure you're using Node.js 20.19.0+ or 22.12.0+ locally
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
3. **Vercel CLI**: Install globally with `npm i -g vercel`

## Deployment Steps

### Option 1: Deploy via Vercel CLI

1. **Build the project locally**:

   ```bash
   pnpm install
   pnpm build
   ```

2. **Deploy to Vercel**:

   ```bash
   vercel
   ```

   Follow the prompts to link your project and deploy.

3. **For production deployment**:
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via GitHub Integration

1. **Push your code to GitHub**
2. **Connect your repository to Vercel**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will automatically detect the configuration

## Configuration Files

The following files have been configured for Vercel deployment:

### `vercel.json`

- Uses Vercel's v2 configuration with explicit builds
- Configures `@vercel/node` for the main application (`index.js`)
- Configures `@vercel/static` for static assets (`public/`)
- Routes static assets directly and all other requests to the Node.js app

### `package.json`

- Added `vercel-build` script that builds the app and prepares assets
- Copies the built server to `index.js` in root
- Copies static assets to `public/` directory
- Sets `main` entry point for Node.js detection

### `.vercelignore`

- Excludes unnecessary files from deployment
- Keeps the deployment package size minimal

## Environment Variables

If your application uses environment variables, set them in the Vercel dashboard:

1. Go to your project settings in Vercel
2. Navigate to "Environment Variables"
3. Add your variables for Production, Preview, and Development environments

## Features

This deployment includes:

- ✅ **Static Route**: Main page with Marko components
- ✅ **Streaming Route**: Server-Sent Events at `/stream`
- ✅ **File-based Routing**: Marko Run's routing system
- ✅ **Asset Optimization**: Built-in asset bundling and optimization
- ✅ **Serverless Functions**: Automatic scaling on Vercel

## Streaming Endpoint

The streaming route at `/stream` implements Server-Sent Events (SSE):

- **Endpoint**: `https://your-app.vercel.app/stream`
- **Content-Type**: `text/event-stream`
- **Features**: Real-time data streaming, automatic cleanup, client disconnect handling
- **Timeout**: 30 seconds maximum (Vercel function limit)

## Troubleshooting

### Build Issues

- Ensure Node.js version compatibility (20.19.0+ or 22.12.0+)
- Clear cache: `rm -rf node_modules .marko-run dist && pnpm install`
- Try building locally first: `pnpm build`

### Runtime Issues

- Check Vercel function logs in the dashboard
- Verify environment variables are set correctly
- Ensure no local file system dependencies

### Streaming Issues

- Vercel has a 30-second timeout for serverless functions
- For longer-running streams, consider using Vercel's Edge Functions
- Check browser developer tools for SSE connection errors

## Performance Tips

1. **Enable Edge Caching**: Static assets are automatically cached
2. **Optimize Bundle Size**: Use dynamic imports for large dependencies
3. **Monitor Function Duration**: Keep streaming responses under 30 seconds
4. **Use Preview Deployments**: Test changes before production

## Commands

```bash
# Install dependencies
pnpm install

# Development server
pnpm dev

# Build for production
pnpm build

# Local preview of production build
pnpm preview

# Deploy to Vercel
vercel

# Deploy to production
vercel --prod
```

## Support

- [Marko Documentation](https://markojs.com)
- [Marko Run GitHub](https://github.com/marko-js/run)
- [Vercel Documentation](https://vercel.com/docs)
