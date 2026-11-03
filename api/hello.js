export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    message: 'Hello from Vercel Serverless Function!',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production'
  });
}
