/**
 * Rozřešení aliasu `@/` pro testy (bez další závislosti).
 *
 * Aplikace importuje přes `@/lib/...`, což Node sám neumí. Bez tohoto hooku
 * nejde doménovou logiku vůbec načíst mimo Next.js – a právě proto v projektu
 * dosud nevznikl jediný test.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./resolver.mjs', pathToFileURL(import.meta.filename));
