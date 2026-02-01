import { clearCookie } from './_utils.js';

export default async function handler(req, res) {
  clearCookie(res, 'admin_token');
  res.statusCode = 302;
  res.setHeader('Location', '/login');
  res.end();
}
