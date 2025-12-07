<script lang="ts">
  import "../app.css";
  import { Tooltip } from "bits-ui";
  import { onNavigate } from '$app/navigation';
  import { dev } from '$app/environment';
  import { siteConfig, getPageMeta, getWebsiteSchema } from '$lib/config/seo';

  // Unregister service workers in dev mode
  if (dev && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }

  let { children } = $props();

  const meta = getPageMeta({});
  const schemaJson = JSON.stringify(getWebsiteSchema());

  // Build the script tag for JSON-LD to avoid ESLint parsing issues
  const jsonLdScript = '<' + 'script type="application/ld+json">' + schemaJson + '</' + 'script>';

  // View Transitions API
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head>
  <!-- Primary Meta Tags -->
  <title>{meta.title}</title>
  <meta name="title" content={meta.title} />
  <meta name="description" content={meta.description} />
  <meta name="keywords" content={meta.keywords} />
  <meta name="author" content={meta.author} />
  <meta name="robots" content={meta.robots} />

  <!-- Canonical URL -->
  <link rel="canonical" href={siteConfig.url} />

  <!-- Priority Hints - Preload critical resources -->
  <link
    rel="preload"
    href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
    as="style"
    fetchpriority="high"
  />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />

  <!-- PWA -->
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#0a0a0a" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Vibecode" />
  <link rel="apple-touch-icon" href="/favicon.png" />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content={meta.og.type} />
  <meta property="og:url" content={meta.og.url} />
  <meta property="og:title" content={meta.og.title} />
  <meta property="og:description" content={meta.og.description} />
  <meta property="og:image" content={meta.og.image} />
  <meta property="og:site_name" content={meta.og.siteName} />
  <meta property="og:locale" content={meta.og.locale} />

  <!-- Twitter -->
  <meta name="twitter:card" content={meta.twitter.card} />
  <meta name="twitter:site" content={meta.twitter.site} />
  <meta name="twitter:title" content={meta.twitter.title} />
  <meta name="twitter:description" content={meta.twitter.description} />
  <meta name="twitter:image" content={meta.twitter.image} />

  <!-- Structured Data (JSON-LD) -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html jsonLdScript}
</svelte:head>

<Tooltip.Provider>
  {@render children()}
</Tooltip.Provider>
