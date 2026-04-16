# Velago Frontend (AWS Migration)

This project contains the React-based frontend and API client for Velago, migrated from Replit to a standard Node.js environment optimized for AWS deployment (Amplify, S3/CloudFront, or ECS).

## Project Structure

- `artifacts/velago-landing`: The main React (Vite) application.
- `lib/api-client-react`: Shared API client generated from OpenAPI specs.
- `lib/api-spec`: OpenAPI specification (`openapi.yaml`) and Orval configuration.

## Prerequisites

- Node.js (v18 or higher)
- npm (v7 or higher, supports workspaces)

## Getting Started

1. **Install Dependencies**
   Run the following command in the root directory:
   ```bash
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```
   This will start the landing page application at `http://localhost:5173`.

3. **Build for Production**
   ```bash
   npm run build
   ```
   The production-ready files will be located in `artifacts/velago-landing/dist`.

## Configuration

### API Integration
The project uses a custom fetch wrapper located in `lib/api-client-react/src/custom-fetch.ts`. To point the frontend to your AWS-hosted backend:
- Open `artifacts/velago-landing/src/main.tsx` (or your entry point).
- Use `setBaseUrl('https://your-api-endpoint.com')`.

### Environment Variables
You can customize the build using standard environment variables:
- `BASE_PATH`: The base URL for the application (default: `/`).
- `PORT`: The port for the dev server (default: `5173`).

## AWS Deployment Tips

### AWS Amplify
- **Build command**: `npm run build`
- **Output directory**: `artifacts/velago-landing/dist`

### S3 + CloudFront
- Sync the contents of `artifacts/velago-landing/dist` to your S3 bucket.
- Ensure you have a "Fallback" rule in CloudFront to redirect all 404s to `index.html` (standard SPA routing).

## Maintenance

### Updating API Client
If the `openapi.yaml` changes, you can regenerate the React hooks:
1. Navigate to `lib/api-spec`.
2. Run `npx orval`.
