import app from '../server.js';

export default async function handler(req, res) {
  try {
    if (req.headers['x-matched-path']) {
      req.url = req.headers['x-matched-path'];
    }
    return app(req, res);
  } catch (err) {
    console.error('Vercel serverless xatoligi:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Serverless funksiya xatoligi', message: err.message });
    }
  }
}
