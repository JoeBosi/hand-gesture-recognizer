// Il corso «La mano al computer» con Astro + Starlight: quarta versione per il confronto (11/11/2026).
// Le pagine in src/content/docs/ e public/ le scrive convertitore/converti.py da corso-scuola/docs/.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://mano.giuseppebosi.com',
  base: '/scuola/starlight/',
  trailingSlash: 'always',
  outDir: '../site-starlight',
  integrations: [
    starlight({
      title: 'La mano al computer',
      description: 'Riconoscere la mano dalla webcam in poche righe di codice: corso per chi conosce il C',
      locales: { root: { label: 'Italiano', lang: 'it' } },
      sidebar: [
        { label: 'Indice del corso', link: '/' },
        { slug: 'lezioni/01-punti-della-mano' },
      ],
      customCss: ['./src/styles/corso.css'],
      components: {
        Footer: './src/components/Footer.astro',
        ThemeProvider: './src/components/TemaChiaro.astro',
        ThemeSelect: './src/components/Vuoto.astro',
      },
      head: [
        { tag: 'link', attrs: { rel: 'stylesheet', href: '/scuola/starlight/comune/accessi.css' } },
        { tag: 'script', attrs: { src: '/scuola/starlight/comune/accessi.js', defer: true } },
      ],
      pagefind: true,
    }),
  ],
});
