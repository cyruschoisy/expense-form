# Expense Report Form

A web application for submitting and managing expense reports with email notifications.

## Features

- Submit expense reports with receipts
- Automatic email notifications to submitter, VPFA, and Finance Committee
- Admin dashboard for reviewing submissions
- PDF export functionality
- Secure authentication

## Email Notifications

When an expense report is submitted, the system automatically sends:

1. **Confirmation email to the submitter** - Acknowledging receipt of their expense report
2. **Notification emails to administrators**:
   - vpfa@uottawaess.ca
   - financecomm@uottawaess.ca

All emails include submission details and links to the admin dashboard for review.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables for email notifications:
   Create a `.env` file in the root directory:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM=your-email@gmail.com
   ```

   For Gmail, you'll need to:
   - Enable 2-factor authentication
   - Generate an App Password: https://support.google.com/accounts/answer/185833
   - Use the App Password as SMTP_PASS

3. Start the development server:
   ```bash
   npm run dev
   ```

4. For production deployment, set the environment variables in your hosting platform (Vercel, etc.)

## Admin Access

- Default admin password hash is set in `server.js`
- To change the password, update the `ADMIN_PASSWORD_HASH` variable with a SHA-256 hash of your desired password

## Email Notifications

When an expense report is submitted, automatic email notifications are sent to:
- **Submitter**: Confirmation that their expense report was received
- **vpfa@uottawaess.ca**: Notification of new submission requiring review
- **financecomm@uottawaess.ca**: Notification of new submission requiring review

## API Endpoints

- `POST /submit` - Submit expense report (triggers email notifications)
- `GET /admin` - Admin dashboard (requires authentication)
- `GET /api/pdf?id=:id` - Export submission as PDF