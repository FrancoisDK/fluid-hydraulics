import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {build, defineConfig, type Plugin, type ResolvedConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

const ROOT_DIR = import.meta.dirname;

function getLatestSourceMtimeMs(): number {
  let latest = 0;
  const checkFile = (p: string) => {
    if (fs.existsSync(p)) {
      const mtime = fs.statSync(p).mtimeMs;
      if (mtime > latest) latest = mtime;
    }
  };
  const walkDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        checkFile(fullPath);
      }
    }
  };
  checkFile(path.join(ROOT_DIR, 'index.html'));
  walkDir(path.join(ROOT_DIR, 'src'));
  return latest;
}

function makeFileProtocolSafe(html: string): string {
  if (/<script\s+type="module">\s*\(function\(\)\{var b=atob\("/.test(html)) {
    return html;
  }
  return html.replace(
    /<script\s+type="module"[^>]*>([\s\S]*)<\/script>/i,
    (_match, jsCode: string) => {
      const b64 = Buffer.from(jsCode, 'utf-8').toString('base64');
      return `<script type="module">(function(){var b=atob("${b64}"),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);var s=document.createElement("script");s.type="module";s.setAttribute("data-runtime-decoded","1");s.textContent=new TextDecoder().decode(a);(document.head||document.documentElement).appendChild(s);})();</script>`;
    }
  );
}

function singleFileDownloadPlugin(): Plugin {
  let cachedHtml: string | null = null;
  let cachedMtimeMs = 0;
  let buildPromise: Promise<string> | null = null;
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: 'singlefile-download-endpoint',
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      server.middlewares.use('/hydraulics-calculator.html', async (_req, res, next) => {
        try {
          const latestMtime = getLatestSourceMtimeMs();
          if (!cachedHtml || latestMtime > cachedMtimeMs) {
            if (!buildPromise) {
              buildPromise = (async () => {
                const outDir = path.resolve(ROOT_DIR, '.vite-singlefile-tmp');
                try {
                  await build({
                    configFile: path.resolve(ROOT_DIR, 'vite.config.ts'),
                    mode: 'production',
                    logLevel: 'silent',
                    build: {
                      outDir,
                      emptyOutDir: true,
                    },
                  });
                  const htmlPath = path.join(outDir, 'index.html');
                  const rawHtml = fs.readFileSync(htmlPath, 'utf-8');
                  return makeFileProtocolSafe(rawHtml);
                } finally {
                  fs.rmSync(outDir, {recursive: true, force: true});
                  buildPromise = null;
                }
              })();
            }
            cachedHtml = await buildPromise;
            cachedMtimeMs = latestMtime;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader(
            'Content-Disposition',
            'attachment; filename="pump-system-hydraulics-calculator.html"'
          );
          res.end(cachedHtml);
        } catch (err) {
          next(err);
        }
      });
    },
    closeBundle(error?: Error) {
      if (error || !resolvedConfig) return;
      const outDir = path.resolve(ROOT_DIR, resolvedConfig.build.outDir);
      const indexPath = path.join(outDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        const cleaned = makeFileProtocolSafe(fs.readFileSync(indexPath, 'utf-8'));
        fs.writeFileSync(indexPath, cleaned, 'utf-8');
        if (path.basename(outDir) === 'dist') {
          fs.writeFileSync(path.join(outDir, 'hydraulics-calculator.html'), cleaned, 'utf-8');
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile(),
      singleFileDownloadPlugin(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(ROOT_DIR, 'dist');
          const srcAssets = path.resolve(ROOT_DIR, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(ROOT_DIR, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
