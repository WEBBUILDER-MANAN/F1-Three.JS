import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  base: './', // relative asset paths so the build works on GitHub Pages subpaths
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  plugins: [
    {
      // dev helper: POST a data-URL to /__shot and it lands in tools/out/
      name: 'shot-saver',
      configureServer(server) {
        server.middlewares.use('/__shot', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
          let body = '';
          req.on('data', c => { body += c; });
          req.on('end', () => {
            const m = String(body).match(/^data:image\/(png|jpeg);base64,(.+)$/);
            if (!m) { res.statusCode = 400; res.end('bad payload'); return; }
            mkdirSync('tools/out', { recursive: true });
            const name = (req.url.split('?name=')[1] || `shot-${Date.now()}`).replace(/[^\w-]/g, '');
            const file = `tools/out/${name}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`;
            writeFileSync(file, Buffer.from(m[2], 'base64'));
            res.end(file);
          });
        });
      },
    },
  ],
});
