<script lang="ts">
  import "../app.css";
  import { siteConfig, getPageMeta, getWebsiteSchema } from '$lib/config/seo';

  let { children } = $props();

  const meta = getPageMeta({});
  const schemaJson = JSON.stringify(getWebsiteSchema());
  // Build the script tag for JSON-LD to avoid ESLint parsing issues
  const jsonLdScript = '<' + 'script type="application/ld+json">' + schemaJson + '</' + 'script>';
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

{@render children()}
