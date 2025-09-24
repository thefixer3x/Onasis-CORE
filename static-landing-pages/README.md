# Static Landing Pages

This directory contains static HTML landing pages that were previously used in the root directory of the onasis-core module. They have been moved here to avoid conflicts with the React application's routing and deployment.

## Files

- `api-gateway.html`: A simple API gateway landing page that was previously used as the index.html in the root directory
- `maas-landing.html`: A comprehensive Memory-as-a-Service landing page

## Background

These static pages were created as temporary solutions for testing and deployment. The React application's LandingPage component (`src/pages/LandingPage.tsx`) is the proper landing page for the application.

## Related Issues

The presence of these static HTML files in the root directory was causing confusion and potentially conflicts with the React application's routing and deployment. This was particularly problematic for authentication flows, as noted in previous issues:

- Dashboard authentication flow was failing because it was trying to reach `https://api.lanonasis.com/auth/login` but this endpoint was returning a static landing page instead of handling authentication
- There was a deployment mismatch where local files showed the MaaS landing page but the live api.lanonasis.com still served old API gateway content

## Solution

1. Moved the static landing pages to this directory
2. Created a proper Vite template HTML file in the root directory
3. Updated the Vite configuration to use the proper template
