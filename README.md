# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

`npm run dev`
`npm run build`
`npm run server`

## Email Setup

The application sends an email with the PDF attachment whenever a form is submitted. To set this up:

1. Copy `.env.example` to `.env` and fill in your email credentials:
   - `SMTP_HOST`: Your SMTP server (e.g., smtp.gmail.com)
   - `SMTP_PORT`: SMTP port (587 for TLS)
   - `EMAIL_USER`: Your email address for authentication
   - `EMAIL_PASS`: Your email password or app password
   - `NO_REPLY_EMAIL`: The no-reply email address to send from (e.g., noreply@yourdomain.com)
   - `ADMIN_EMAIL`: The email address to receive notifications

2. For Gmail, you need to generate an App Password:
   - Go to Google Account settings
   - Enable 2FA
   - Generate an App Password for this app

3. For production (Vercel), set these as environment variables in your Vercel dashboard.