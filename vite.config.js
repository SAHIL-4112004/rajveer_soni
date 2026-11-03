import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vercel-api-local-runner',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url.startsWith('/api/')) {
            const rawEndpoint = req.url.split('?')[0].replace('/api/', '');
            try {
              if (req.method === 'POST' || req.method === 'PUT') {
                const buffers = [];
                for await (const chunk of req) {
                  buffers.push(chunk);
                }
                const raw = Buffer.concat(buffers).toString();
                try {
                  req.body = raw ? JSON.parse(raw) : {};
                } catch {
                  req.body = raw;
                }
              }

              res.status = (statusCode) => {
                res.statusCode = statusCode;
                return res;
              };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
              };

              const filePath = path.resolve(`./api/${rawEndpoint}.js`);
              const mod = await import(`file://${filePath}?t=${Date.now()}`);
              return await mod.default(req, res);
            } catch (err) {
              console.error('API Error in /api/' + rawEndpoint, err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 3000,
  },
});
